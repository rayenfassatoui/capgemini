"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { IconMessageChatbot } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { AgentChatSurface } from "./chat/agent-chat-surface";
import { useStatisticsChatController } from "./chat/use-statistics-chat-controller";

export function StatisticsChat() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAgentWorkspace = pathname === "/agent";
  const chat = useStatisticsChatController({
    enabled: open && !isAgentWorkspace,
  });

  if (isAgentWorkspace) {
    return null;
  }

  const openWorkspace = () => {
    setOpen(false);
    router.push("/agent");
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="relative group">
              <div className="absolute -inset-0.5 rounded-full bg-linear-to-r from-primary via-indigo-500 to-purple-600 opacity-75 blur-sm transition duration-500 group-hover:opacity-100 group-hover:blur-md animate-pulse-slow" />
              <Button
                onClick={() => setOpen(true)}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-primary to-indigo-600 text-white shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-primary/25 border border-white/10"
                aria-label="Open AI analytics assistant"
              >
                <IconMessageChatbot className="size-7" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-50 flex w-105 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-white/8 backdrop-blur-xl bg-card/70 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-primary/10"
            style={{ height: "min(600px, calc(100vh - 3rem))" }}
          >
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-primary/5 to-transparent pointer-events-none" />
            <AgentChatSurface
              controller={chat}
              contextLabel="Page-aware HR analysis"
              onClose={() => setOpen(false)}
              onExpand={openWorkspace}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
