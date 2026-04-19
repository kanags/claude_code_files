"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { useFileSystem } from "./file-system-context";
import { setHasAnonWork } from "@/lib/anon-work-tracker";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: UIMessage[];
}

interface ChatContextType {
  messages: UIMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  projectId,
  initialMessages = [],
}: ChatContextProps & { children: ReactNode }) {
  const { fileSystem, handleToolCall } = useFileSystem();
  const [input, setInput] = useState("");

  const fileSystemRef = useRef(fileSystem);
  fileSystemRef.current = fileSystem;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const handleToolCallRef = useRef(handleToolCall);
  handleToolCallRef.current = handleToolCall;

  const transport = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        files: fileSystemRef.current.serialize(),
        projectId: projectIdRef.current,
      }),
    })
  ).current;

  const { messages, sendMessage, status } = useAIChat({
    transport,
    messages: initialMessages,
    onToolCall: ({ toolCall }) => {
      handleToolCallRef.current({
        toolName: toolCall.toolName,
        args: (toolCall as any).input,
      });
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystemRef.current.serialize());
    }
  }, [messages, projectId]);

  return (
    <ChatContext.Provider
      value={{ messages, input, handleInputChange, handleSubmit, status }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
