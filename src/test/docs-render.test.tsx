import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ServiceDisruptionDocs } from "@/components/admin/docs/ServiceDisruptionDocs";
import PlatformFeaturesReport from "@/components/admin/docs/PlatformFeaturesReport";
import { MessagingDocs } from "@/components/admin/docs/MessagingDocs";
import { EmailDocs } from "@/components/admin/docs/EmailDocs";
import { VoIPDocs } from "@/components/admin/docs/VoIPDocs";
import PlatformGlossary from "@/components/admin/docs/PlatformGlossary";
import { EventTemplateMatrix } from "@/components/admin/docs/EventTemplateMatrix";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Docs Components Render Test", () => {
  it("renders ServiceDisruptionDocs without throwing", () => {
    expect(() => render(<ServiceDisruptionDocs />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders PlatformFeaturesReport without throwing", () => {
    expect(() => render(<PlatformFeaturesReport />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders MessagingDocs without throwing", () => {
    expect(() => render(<MessagingDocs />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders EmailDocs without throwing", () => {
    expect(() => render(<EmailDocs />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders VoIPDocs without throwing", () => {
    expect(() => render(<VoIPDocs />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders PlatformGlossary without throwing", () => {
    expect(() => render(<PlatformGlossary />, { wrapper: Wrapper })).not.toThrow();
  });

  it("renders EventTemplateMatrix without throwing", () => {
    expect(() => render(<EventTemplateMatrix />, { wrapper: Wrapper })).not.toThrow();
  });
});
