import { tool, jsonSchema } from "ai";
import { VirtualFileSystem } from "@/lib/file-system";

export const buildStrReplaceTool = (fileSystem: VirtualFileSystem) => {
  return tool({
    description: "View, create, or edit files in the virtual file system using str_replace operations.",
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["view", "create", "str_replace", "insert", "undo_edit"],
        },
        path: { type: "string" },
        file_text: { type: "string" },
        insert_line: { type: "number" },
        new_str: { type: "string" },
        old_str: { type: "string" },
        view_range: { type: "array", items: { type: "number" } },
      },
      required: ["command", "path"],
    }),
    execute: async ({ command, path, file_text, insert_line, new_str, old_str, view_range }: {
      command: "view" | "create" | "str_replace" | "insert" | "undo_edit";
      path: string;
      file_text?: string;
      insert_line?: number;
      new_str?: string;
      old_str?: string;
      view_range?: number[];
    }) => {
      switch (command) {
        case "view":
          return fileSystem.viewFile(path, view_range as [number, number] | undefined);
        case "create":
          return fileSystem.createFileWithParents(path, file_text || "");
        case "str_replace":
          return fileSystem.replaceInFile(path, old_str || "", new_str || "");
        case "insert":
          return fileSystem.insertInFile(path, insert_line || 0, new_str || "");
        case "undo_edit":
          return `Error: undo_edit is not supported. Use str_replace to revert changes.`;
      }
    },
  });
};
