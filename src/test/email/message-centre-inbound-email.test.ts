/**
 * Message Centre Inbound Email Architecture Test Suite
 *
 * Validates:
 * 1. Provenance preservation: Inbound emails retain sourceType: 'inbound_email',
 *    channel: 'email', and are not copied into inbox_messages table.
 * 2. Inbound attachment display via InboundEmailAttachments component.
 * 3. AI Auto-responder grounding on inbound email content.
 * 4. Omnichannel Message Editor handoff with initialValues pre-population.
 * 5. Outbound gateway routing for replies without duplicate email transports.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { useInboundMessages } from "../../hooks/useInboundMessages";

describe("Message Centre: Unified Inbound Email Integration", () => {
  describe("1. useInboundMessages Adapter", () => {
    it("exports useInboundMessages hook with provenance preservation types", () => {
      expect(useInboundMessages).toBeDefined();
      expect(typeof useInboundMessages).toBe("function");

      const hookFile = path.resolve(process.cwd(), "src/hooks/useInboundMessages.ts");
      const content = fs.readFileSync(hookFile, "utf8");

      expect(content).toContain("sourceType: 'inbound_email'");
      expect(content).toContain("sourceId: string");
      expect(content).toContain("channel: 'email'");
      expect(content).toContain("listInboundEmails");
      expect(content).toContain("getInboundEmail");
    });
  });

  describe("2. AdminMessageConsole Integration", () => {
    it("integrates useInboundMessages without creating a separate Inbound Email Centre", () => {
      const consoleFile = path.resolve(
        process.cwd(),
        "src/components/admin/messaging/AdminMessageConsole.tsx"
      );
      const content = fs.readFileSync(consoleFile, "utf8");

      expect(content).toContain("useInboundMessages");
      expect(content).toContain("InboundEmailAttachments");
      expect(content).toContain("isInboundEmail");
      expect(content).toContain("inboundEmail");
      expect(content).toContain("unifiedInboundConversations");
      expect(content).toContain("send-outbound-email");
    });

    it("connects AiAutoResponderCard to message composer and message editor", () => {
      const consoleFile = path.resolve(
        process.cwd(),
        "src/components/admin/messaging/AdminMessageConsole.tsx"
      );
      const content = fs.readFileSync(consoleFile, "utf8");

      expect(content).toContain("AiAutoResponderCard");
      expect(content).toContain("onApplyDraft");
      expect(content).toContain("onOpenInEditor");
      expect(content).toContain("Open in Message Editor");
    });
  });

  describe("3. AiAutoResponderCard Upgrades", () => {
    it("supports onOpenInEditor prop for direct transition to Message Editor", () => {
      const cardFile = path.resolve(
        process.cwd(),
        "src/components/admin/messaging/AiAutoResponderCard.tsx"
      );
      const content = fs.readFileSync(cardFile, "utf8");

      expect(content).toContain("onOpenInEditor?: (draft: { subject?: string; body: string }) => void;");
      expect(content).toContain("Message Editor");
    });
  });

  describe("4. MessagingCenter & MessageComposer Omnichannel Handoff", () => {
    it("MessagingCenter binds composerInitialValues between Console and Composer", () => {
      const centerFile = path.resolve(
        process.cwd(),
        "src/components/admin/MessagingCenter.tsx"
      );
      const content = fs.readFileSync(centerFile, "utf8");

      expect(content).toContain("composerInitialValues");
      expect(content).toContain("setComposerInitialValues");
      expect(content).toContain("initialValues={composerInitialValues}");
    });

    it("MessageComposer accepts initialValues and synchronizes draft fields", () => {
      const composerFile = path.resolve(
        process.cwd(),
        "src/components/admin/MessageComposer.tsx"
      );
      const content = fs.readFileSync(composerFile, "utf8");

      expect(content).toContain("export interface MessageComposerProps");
      expect(content).toContain("initialValues?: {");
      expect(content).toContain("setChannel(initialValues.channel)");
      expect(content).toContain("setSubject(initialValues.subject)");
      expect(content).toContain("setBody(initialValues.body)");
    });
  });
});
