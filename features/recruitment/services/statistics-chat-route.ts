import "server-only";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  createChatConversation,
  deleteChatConversation,
  getChatHistory,
  listChatConversations,
} from "./chat";
import { handleStatisticsChatPost } from "./statistics-chat-agent";

async function getAuthSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) return null;
  const role = session.user.role ?? "ta";
  if (!["ta", "admin", "manager", "hr"].includes(role)) return null;
  return session;
}

export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (conversationId) {
    try {
      const history = await getChatHistory(conversationId, session.user.id);
      return Response.json(history);
    } catch {
      return new Response("Not found or unauthorized", { status: 404 });
    }
  }

  const conversations = await listChatConversations(session.user.id);
  return Response.json({ conversations });
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return new Response("conversationId is required", { status: 400 });
  }

  await deleteChatConversation(conversationId, session.user.id);
  return Response.json({ success: true });
}

export async function PUT() {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const conversation = await createChatConversation(session.user.id);
  return Response.json(conversation);
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  return handleStatisticsChatPost(request, session);
}
