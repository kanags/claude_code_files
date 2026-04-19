"use client";

import { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { User, Bot, Loader2, CheckCircle2, FileCode2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

interface FileAction {
  path: string;
  action: "created" | "modified";
}

function ToolCallSummary({ parts }: { parts: UIMessage["parts"] }) {
  const fileMap = new Map<string, "created" | "modified">();

  for (const part of parts) {
    const p = part as any;
    if ((p.type?.startsWith("tool-") || p.type === "dynamic-tool") && p.state === "output-available") {
      const input = p.input as any;
      if (!input?.path || !input?.command) continue;
      const cmd: string = input.command;
      if (cmd === "view") continue;
      if (cmd === "create") {
        fileMap.set(input.path, "created");
      } else if (cmd === "str_replace" || cmd === "insert") {
        if (!fileMap.has(input.path)) fileMap.set(input.path, "modified");
      }
    }
  }

  const files: FileAction[] = Array.from(fileMap.entries()).map(([path, action]) => ({ path, action }));

  if (files.length === 0) return null;

  // Derive component name from created component files
  const componentFile = files.find(
    (f) => f.action === "created" && f.path.includes("/components/")
  ) ?? files.find((f) => f.action === "created" && f.path !== "/App.jsx" && f.path !== "/App.tsx");

  const componentName = componentFile
    ? componentFile.path.split("/").pop()?.replace(/\.(jsx|tsx|js|ts)$/, "")
    : null;

  const intro = componentName
    ? `Here's your ${componentName} component!`
    : "Your component is ready to preview!";

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        <span className="text-sm font-medium text-neutral-800">{intro}</span>
      </div>
      <div className="flex flex-col gap-1 pl-1">
        {files.map(({ path, action }) => (
          <div key={path} className="flex items-center gap-2">
            <FileCode2 className="h-3 w-3 text-neutral-400 flex-shrink-0" />
            <span className="text-xs font-mono text-neutral-600 truncate">{path}</span>
            <span
              className={cn(
                "text-[10px] rounded px-1.5 py-0.5 font-medium flex-shrink-0",
                action === "created"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              )}
            >
              {action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4 shadow-sm">
          <Bot className="h-7 w-7 text-blue-600" />
        </div>
        <p className="text-neutral-900 font-semibold text-lg mb-2">Start a conversation to generate React components</p>
        <p className="text-neutral-500 text-sm max-w-sm">I can help you create buttons, forms, cards, and more</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-6">
      <div className="space-y-6 max-w-4xl mx-auto w-full">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 shadow-sm flex items-center justify-center">
                  <Bot className="h-4.5 w-4.5 text-neutral-700" />
                </div>
              </div>
            )}

            <div className={cn(
              "flex flex-col gap-2 max-w-[85%]",
              message.role === "user" ? "items-end" : "items-start"
            )}>
              <div className={cn(
                "rounded-xl px-4 py-3",
                message.role === "user"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-neutral-900 border border-neutral-200 shadow-sm"
              )}>
                <div className="text-sm">
                  {message.role === "assistant" &&
                    !message.parts.some((p) => p.type === "text" && (p as any).text?.trim()) &&
                    !isLoading && (
                      <ToolCallSummary parts={message.parts} />
                    )}
                  {message.parts.map((part, partIndex) => {
                    switch (part.type) {
                      case "text":
                        return message.role === "user" ? (
                          <span key={partIndex} className="whitespace-pre-wrap">{part.text}</span>
                        ) : (
                          <MarkdownRenderer
                            key={partIndex}
                            content={part.text}
                            className="prose-sm"
                          />
                        );
                      case "reasoning":
                        return (
                          <div key={partIndex} className="mt-3 p-3 bg-white/50 rounded-md border border-neutral-200">
                            <span className="text-xs font-medium text-neutral-600 block mb-1">Reasoning</span>
                            <span className="text-sm text-neutral-700">{(part as any).reasoning ?? (part as any).text}</span>
                          </div>
                        );
                      case "step-start":
                        return partIndex > 0 ? <hr key={partIndex} className="my-3 border-neutral-200" /> : null;
                      default: {
                        const p = part as any;
                        if (p.type?.startsWith("tool-") || p.type === "dynamic-tool") {
                          const isComplete = p.state === "output-available";
                          return (
                            <div key={partIndex} className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
                              {isComplete ? (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span className="text-neutral-700">{p.toolName}</span>
                                </>
                              ) : (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                  <span className="text-neutral-700">{p.toolName}</span>
                                </>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }
                    }
                  })}
                  {isLoading &&
                    message.role === "assistant" &&
                    messages.indexOf(message) === messages.length - 1 &&
                    !message.parts.some((p) => p.type === "text" && (p as any).text) && (
                      <div className="flex items-center gap-2 text-neutral-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-sm">Generating...</span>
                      </div>
                    )}
                </div>
              </div>
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0">
                <div className="w-9 h-9 rounded-lg bg-blue-600 shadow-sm flex items-center justify-center">
                  <User className="h-4.5 w-4.5 text-white" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
