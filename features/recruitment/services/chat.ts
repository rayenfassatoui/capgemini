import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chatConversations,
  chatMessages,
  pendingAgentActions,
} from '@/db/schema';
import { callOpenRouter } from './ai';
import { getCvPoolStats, getJobsStats, getSmartInsights } from './statistics';

// ---------------------------------------------------------------------------
// AI Statistics Q&A (separate from agent chat - uses aggregated stats)
// ---------------------------------------------------------------------------

export async function askAiAboutStatistics(
  question: string,
  userId: string
): Promise<string> {
  const [cvStats, jobsStats, insights] = await Promise.all([
    getCvPoolStats(userId),
    getJobsStats(userId),
    getSmartInsights(userId),
  ]);

  const dataContext = `
## CV Pool Summary
- Total CVs: ${cvStats.totalCvs}
- Top Skills (name: count): ${cvStats.topSkills.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}
- Languages: ${cvStats.languageDistribution.map((l) => `${l.language} (${l.count})`).join(', ') || 'None'}
- Upload Trend (last 7 days): ${cvStats.uploadTrend.map((t) => `${t.date}: ${t.count}`).join(', ')}

## Jobs Summary
- Total Jobs: ${jobsStats.totalJobs}
- By Seniority: ${jobsStats.bySeniority.map((s) => `${s.seniority} (${s.count})`).join(', ') || 'None'}
- By Status: ${jobsStats.byStatus.map((s) => `${s.status} (${s.count})`).join(', ') || 'None'}
- By Business Unit: ${jobsStats.byBusinessUnit.map((b) => `${b.unit} (${b.count})`).join(', ') || 'None'}
- Most Demanded Skills: ${jobsStats.topSkillsDemand.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}

## Pipeline & Insights
- Most Demanded Job Profiles: ${insights.mostDemandedJobProfiles.map((p) => `${p.title} (${p.count})`).join(', ') || 'None'}
- Most Common CV Skills: ${insights.mostCommonCvSkills.map((s) => `${s.skill} (${s.count})`).join(', ') || 'None'}
- Skill Gap (demand vs supply): ${insights.skillGapAnalysis.map((g) => `${g.skill}: demand=${g.demand}, supply=${g.supply}`).join('; ') || 'None'}
- Pipeline Funnel: ${Object.entries(insights.pipelineFunnel).map(([stage, count]) => `${stage}=${count}`).join(', ')}
`.trim();

  const systemPrompt = `You are an AI recruitment analytics assistant at Capgemini. You have access to aggregated, anonymized recruitment statistics. Answer questions about trends, skills, pipeline health, and recruitment insights based on the data below. Be concise, data-driven, and actionable. Do not invent data that is not provided. If you cannot answer from the data, say so.

${dataContext}`;

  return callOpenRouter(systemPrompt, question);
}

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

export async function listChatConversations(userId: string) {
  return db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function createChatConversation(userId: string, title?: string) {
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId, title: title ?? 'New Chat' })
    .returning();

  return conversation;
}

export async function getOrCreateChatConversation(userId: string, conversationId?: string) {
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, conversationId),
          eq(chatConversations.userId, userId)
        )
      );

    if (existing) return existing;
  }

  const [latest] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);

  if (latest) return latest;

  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId })
    .returning();

  return conversation;
}

export async function getChatHistory(conversationId: string, userId: string) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId)
      )
    );

  if (!conversation) {
    throw new Error('Conversation not found or unauthorized access');
  }

  const [messages, agentActions] = await Promise.all([
    db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt)),
    db
      .select({
        id: pendingAgentActions.id,
        status: pendingAgentActions.status,
      })
      .from(pendingAgentActions)
      .where(
        and(
          eq(pendingAgentActions.conversationId, conversationId),
          eq(pendingAgentActions.userId, userId),
        ),
      ),
  ]);

  return { conversationId, messages, agentActions };
}

export async function saveChatMessage(
  conversationId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
) {
  const [message] = await db
    .insert(chatMessages)
    .values({ conversationId, role, content })
    .returning();

  if (role === "user") {
    const [convo] = await db
      .select({ title: chatConversations.title })
      .from(chatConversations)
      .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)));

    if (convo?.title === "New Chat" || convo?.title === "Analytics Chat") {
      const title = content.length > 40 ? content.slice(0, 40) + "..." : content;
      await db
        .update(chatConversations)
        .set({ title, updatedAt: new Date() })
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)));
    } else {
      await db
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)));
    }
  } else {
    await db
      .update(chatConversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.userId, userId)));
  }

  return message;
}

export async function deleteChatConversation(conversationId: string, userId: string) {
  await db
    .delete(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId)
      )
    );
}

export async function clearChatConversation(conversationId: string, userId: string) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, conversationId),
        eq(chatConversations.userId, userId)
      )
    );

  if (!conversation) return;

  await db
    .delete(chatMessages)
    .where(eq(chatMessages.conversationId, conversation.id));

  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversation.id));
}
