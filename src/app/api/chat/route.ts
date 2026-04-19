import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";

export async function POST(req: Request) {
  const {
    messages,
    files,
    projectId,
  }: { messages: UIMessage[]; files: Record<string, FileNode>; projectId?: string } =
    await req.json();

  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  const isMockProvider = !process.env.ANTHROPIC_API_KEY;
  const result = streamText({
    model,
    system: generationPrompt,
    messages: await convertToModelMessages(messages),
    maxTokens: 10_000,
    maxSteps: isMockProvider ? 4 : 40,
    onError: (err: any) => {
      console.error(err);
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ response }) => {
      if (projectId) {
        try {
          const session = await getSession();
          if (!session) return;

          await prisma.project.update({
            where: { id: projectId, userId: session.userId },
            data: {
              messages: JSON.stringify(messages),
              data: JSON.stringify(fileSystem.serialize()),
            },
          });
        } catch (error) {
          console.error("Failed to save project data:", error);
        }
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

export const maxDuration = 120;
