// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  NotificationsScrollingIframe,
  type UserNotificationItem,
} from "../NotificationsScrollingIframe";

describe("NotificationsScrollingIframe", () => {
  it("renders container with iframe and scroll buttons", () => {
    const mockNotifications: UserNotificationItem[] = [
      {
        id: "notif-1",
        kind: "onboarding_stage",
        title: "Stage Complete",
        body: "Your stage has updated.",
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    render(
      <NotificationsScrollingIframe
        notifications={mockNotifications}
        loading={false}
        userRole="driver"
      />
    );

    const container = document.getElementById("user-notifications-scrolling-container");
    expect(container).toBeTruthy();

    const iframe = document.getElementById("user-notifications-iframe");
    expect(iframe).toBeTruthy();

    const scrollUpBtn = screen.getByLabelText("Scroll notifications up");
    expect(scrollUpBtn).toBeTruthy();

    const scrollDownBtn = screen.getByLabelText("Scroll notifications down");
    expect(scrollDownBtn).toBeTruthy();
  });
});
