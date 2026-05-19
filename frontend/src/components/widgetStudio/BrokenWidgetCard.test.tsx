import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrokenWidgetCard } from "./BrokenWidgetCard";

describe("BrokenWidgetCard", () => {
  it("renders warning message and optional title", () => {
    render(
      <BrokenWidgetCard
        title="My widget"
        message="Category no longer exists."
      />,
    );
    expect(screen.getByTestId("broken-widget-card")).toBeInTheDocument();
    expect(screen.getByText("My widget")).toBeInTheDocument();
    expect(screen.getByText("Category no longer exists.")).toBeInTheDocument();
  });
});
