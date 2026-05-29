import { describe, it, expect, beforeEach } from "vitest";
import {
  getGoal,
  setGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  formatGoalStatus,
  goalSystemPrompt,
  goalCompactionContext,
  scanForGoalMarkers,
} from "./goal.js";

describe("session goal", () => {
  beforeEach(() => {
    clearGoal("test-session");
  });

  it("starts with no goal", () => {
    expect(getGoal("test-session")).toBeUndefined();
  });

  it("sets and retrieves a goal", () => {
    setGoal("test-session", "Add dark mode toggle");
    const goal = getGoal("test-session");
    expect(goal?.objective).toBe("Add dark mode toggle");
    expect(goal?.status).toBe("active");
    expect(goal?.setAt).toBeGreaterThan(0);
  });

  it("clears a goal", () => {
    setGoal("test-session", "some goal");
    expect(clearGoal("test-session")).toBe(true);
    expect(getGoal("test-session")).toBeUndefined();
  });

  it("returns false when clearing nonexistent goal", () => {
    expect(clearGoal("no-such-session")).toBe(false);
  });

  describe("pause/resume", () => {
    it("pauses an active goal", () => {
      setGoal("test-session", "do stuff");
      expect(pauseGoal("test-session")).toBe(true);
      expect(getGoal("test-session")?.status).toBe("paused");
    });

    it("cannot pause a non-active goal", () => {
      setGoal("test-session", "do stuff");
      pauseGoal("test-session");
      expect(pauseGoal("test-session")).toBe(false);
    });

    it("resumes a paused goal", () => {
      setGoal("test-session", "do stuff");
      pauseGoal("test-session");
      expect(resumeGoal("test-session")).toBe(true);
      expect(getGoal("test-session")?.status).toBe("active");
    });

    it("cannot resume a non-paused goal", () => {
      setGoal("test-session", "do stuff");
      expect(resumeGoal("test-session")).toBe(false);
    });
  });

  describe("marker scanning", () => {
    it("detects [goal:complete]", () => {
      setGoal("test-session", "fix bug");
      const result = scanForGoalMarkers("test-session", "Done fixing.\n[goal:complete]");
      expect(result).toBe("complete");
      expect(getGoal("test-session")?.status).toBe("completed");
    });

    it("detects bare goal:complete", () => {
      setGoal("test-session", "fix bug");
      const result = scanForGoalMarkers("test-session", "Done.\ngoal:complete");
      expect(result).toBe("complete");
    });

    it("detects [goal:blocked] with blocker reason", () => {
      setGoal("test-session", "fix bug");
      const result = scanForGoalMarkers(
        "test-session",
        "I need the API key to proceed.\n[goal:blocked]"
      );
      expect(result).toBe("blocked");
      expect(getGoal("test-session")?.status).toBe("blocked");
      expect(getGoal("test-session")?.blocker).toBe("I need the API key to proceed.");
    });

    it("ignores markers in non-active goals", () => {
      setGoal("test-session", "fix bug");
      pauseGoal("test-session");
      const result = scanForGoalMarkers("test-session", "Done.\n[goal:complete]");
      expect(result).toBeNull();
    });

    it("ignores non-marker text", () => {
      setGoal("test-session", "fix bug");
      const result = scanForGoalMarkers("test-session", "Still working on it.");
      expect(result).toBeNull();
    });

    it("ignores 'goal complete' natural language", () => {
      setGoal("test-session", "fix bug");
      const result = scanForGoalMarkers("test-session", "The goal complete process is done.");
      expect(result).toBeNull();
    });
  });

  describe("system prompt", () => {
    it("generates prompt with safety wrapping for active goal", () => {
      setGoal("test-session", "Fix auth bug");
      const prompt = goalSystemPrompt("test-session");
      expect(prompt).toContain("<session-goal>");
      expect(prompt).toContain("<goal_objective>");
      expect(prompt).toContain("Fix auth bug");
      expect(prompt).toContain("user-provided task description");
      expect(prompt).toContain("[goal:complete]");
      expect(prompt).toContain("[goal:blocked]");
    });

    it("generates empty prompt for paused goal", () => {
      setGoal("test-session", "Fix auth bug");
      pauseGoal("test-session");
      expect(goalSystemPrompt("test-session")).toBe("");
    });

    it("generates empty prompt without goal", () => {
      expect(goalSystemPrompt("test-session")).toBe("");
    });
  });

  describe("compaction context", () => {
    it("includes objective and status", () => {
      setGoal("test-session", "Refactor database layer");
      const ctx = goalCompactionContext("test-session");
      expect(ctx).toContain("Refactor database layer");
      expect(ctx).toContain("active");
      expect(ctx).toContain("preserved across compaction");
    });

    it("includes blocker when present", () => {
      setGoal("test-session", "Fix bug");
      scanForGoalMarkers("test-session", "Need API key\n[goal:blocked]");
      const ctx = goalCompactionContext("test-session");
      expect(ctx).toContain("blocked by: Need API key");
    });

    it("returns empty without goal", () => {
      expect(goalCompactionContext("test-session")).toBe("");
    });
  });

  it("isolates goals between sessions", () => {
    setGoal("session-a", "Goal A");
    setGoal("session-b", "Goal B");
    expect(getGoal("session-a")?.objective).toBe("Goal A");
    expect(getGoal("session-b")?.objective).toBe("Goal B");
  });
});
