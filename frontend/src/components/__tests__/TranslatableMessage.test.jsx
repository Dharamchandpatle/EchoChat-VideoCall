// Component tests for the Stream message translation control.
// The real stream-chat-react MessageProvider and useMessageContext are used, so the message is
// supplied exactly the way stream-chat-react supplies it. Only MessageSimple is replaced by a stub,
// and the translation API is mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MessageProvider } from "stream-chat-react";

vi.mock("stream-chat-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Like the real MessageSimple, read the message from the Stream message context.
    MessageSimple: () => {
      const { message } = actual.useMessageContext("MessageSimple");
      return <div data-testid="stream-message">{message?.text}</div>;
    },
  };
});

const authState = { authUser: { _id: "me-id" } };
vi.mock("../../hooks/useAuthUser", () => ({ default: () => authState }));

const prefsState = {
  target: { name: "Marathi", code: "mr" },
  nativeTarget: { name: "Hindi", code: "hi" },
  learningTarget: { name: "Marathi", code: "mr" },
  autoTranslate: false,
  displayMode: "inline",
};
vi.mock("../../hooks/useTranslationPreferences", () => ({ default: () => prefsState }));

const apiMock = vi.fn();
vi.mock("../../lib/translationApi", () => ({ translateMessage: (...args) => apiMock(...args) }));

import TranslatableMessage from "../TranslatableMessage";
import { useChatTranslationStore } from "../../store/useChatTranslationStore";

const renderInStreamContext = (message) =>
  render(
    <MessageProvider value={{ message, groupedByUser: false }}>
      <TranslatableMessage groupedByUser={false} />
    </MessageProvider>
  );

const textMessage = (overrides = {}) => ({
  id: "msg-1",
  text: "नमस्ते, आप कैसे हैं?",
  type: "regular",
  user: { id: "other-id" },
  attachments: [],
  ...overrides,
});

beforeEach(() => {
  apiMock.mockReset();
  prefsState.autoTranslate = false;
  useChatTranslationStore.setState({ entries: {}, hidden: {} });
});

describe("Translate control visibility (Stream message context)", () => {
  it("shows Translate on an incoming text message", () => {
    renderInStreamContext(textMessage());
    expect(screen.getByRole("button", { name: "Translate message to Marathi" })).toBeInTheDocument();
    expect(screen.getByTestId("stream-message")).toHaveTextContent("नमस्ते, आप कैसे हैं?");
  });

  it("shows Translate on an outgoing (own) text message too", () => {
    renderInStreamContext(textMessage({ id: "msg-own", user: { id: "me-id" }, text: "मी ठीक आहे." }));
    expect(screen.getByRole("button", { name: "Translate message to Marathi" })).toBeInTheDocument();
  });

  it("does not show Translate for system, deleted, attachment-only, or video-invite messages", () => {
    const cases = [
      textMessage({ type: "system" }),
      textMessage({ deleted_at: new Date().toISOString() }),
      textMessage({ text: "", attachments: [{ type: "image" }] }),
      textMessage({ text: "📞 I've started a video call! Join me here: http://localhost:5173/call/abc123" }),
      textMessage({ extraData: { kind: "video_call_invite" }, text: "Join my call" }),
    ];
    for (const message of cases) {
      const { unmount } = renderInStreamContext(message);
      expect(screen.queryByRole("button", { name: /translate message/i })).toBeNull();
      unmount();
    }
  });

  it("the Stream message is rendered untouched beside the control", () => {
    renderInStreamContext(textMessage());
    expect(screen.getByTestId("stream-message").textContent).toBe("नमस्ते, आप कैसे हैं?");
  });
});

describe("manual translation", () => {
  it("sends the original text with the viewer's target language and shows the translation", async () => {
    apiMock.mockResolvedValue({ translatedText: "तू कसा आहेस?", sourceLanguage: "Hindi", targetLanguage: "Marathi" });
    renderInStreamContext(textMessage());

    fireEvent.click(screen.getByRole("button", { name: "Translate message to Marathi" }));

    expect(apiMock).toHaveBeenCalledWith({ text: "नमस्ते, आप कैसे हैं?", targetLanguage: "mr" });
    expect(await screen.findByText("तू कसा आहेस?")).toBeInTheDocument();
    expect(screen.getByText("Hindi → Marathi")).toBeInTheDocument();
  });

  it("Show original hides the translation and Show Marathi brings it back", async () => {
    apiMock.mockResolvedValue({ translatedText: "तू कसा आहेस?", sourceLanguage: "Hindi", targetLanguage: "Marathi" });
    renderInStreamContext(textMessage());
    fireEvent.click(screen.getByRole("button", { name: "Translate message to Marathi" }));
    await screen.findByText("तू कसा आहेस?");

    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.queryByText("तू कसा आहेस?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Marathi" }));
    expect(screen.getByText("तू कसा आहेस?")).toBeInTheDocument();
  });

  it("failures show a clear message and Retry works", async () => {
    apiMock.mockRejectedValueOnce({ response: { data: { error: "AI provider is temporarily unavailable. Please try again." } } });
    apiMock.mockResolvedValueOnce({ translatedText: "ok", sourceLanguage: "Hindi", targetLanguage: "Marathi" });
    renderInStreamContext(textMessage());

    fireEvent.click(screen.getByRole("button", { name: "Translate message to Marathi" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry translation to Marathi" }));
    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("rapid repeated clicks send one request", async () => {
    let resolveFn;
    apiMock.mockImplementation(() => new Promise((resolve) => (resolveFn = resolve)));
    renderInStreamContext(textMessage());
    const button = screen.getByRole("button", { name: "Translate message to Marathi" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => resolveFn({ translatedText: "done", sourceLanguage: "Hindi", targetLanguage: "Marathi" }));
    expect(await screen.findByText("done")).toBeInTheDocument();
  });

  it("the language menu offers native, learning, English, and another language", () => {
    renderInStreamContext(textMessage());
    expect(screen.getByText("Translate to native: Hindi")).toBeInTheDocument();
    expect(screen.getByText("Translate to learning: Marathi")).toBeInTheDocument();
    expect(screen.getByText("Translate to English")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Translate to another language" })).toBeInTheDocument();
  });

  it("choosing English from the menu translates into English", async () => {
    apiMock.mockResolvedValue({ translatedText: "How are you?", sourceLanguage: "Hindi", targetLanguage: "English" });
    renderInStreamContext(textMessage());
    fireEvent.click(screen.getByText("Translate to English"));
    expect(apiMock).toHaveBeenCalledWith({ text: "नमस्ते, आप कैसे हैं?", targetLanguage: "en" });
    expect(await screen.findByText("How are you?")).toBeInTheDocument();
  });
});

describe("automatic translation", () => {
  it("translates incoming text once when automatic translation is on", async () => {
    prefsState.autoTranslate = true;
    apiMock.mockResolvedValue({ translatedText: "auto result", sourceLanguage: "Hindi", targetLanguage: "Marathi" });
    renderInStreamContext(textMessage());
    expect(await screen.findByText("auto result")).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-translate when the viewer has it off", () => {
    prefsState.autoTranslate = false;
    renderInStreamContext(textMessage());
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("does not auto-translate the viewer's own messages", () => {
    prefsState.autoTranslate = true;
    renderInStreamContext(textMessage({ user: { id: "me-id" } }));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("a failed automatic translation stays quiet and offers Retry", async () => {
    prefsState.autoTranslate = true;
    apiMock.mockRejectedValue({ response: { data: { error: "Translation unavailable." } } });
    renderInStreamContext(textMessage());
    expect(await screen.findByRole("alert")).toHaveTextContent("Translation unavailable.");
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Retry translation to Marathi" })).toBeInTheDocument();
  });
});

describe("independent viewer targets", () => {
  it("each viewer's own target language is used, not the sender's", async () => {
    // Viewer B's target is Hindi, regardless of who sent the message.
    prefsState.target = { name: "Hindi", code: "hi" };
    apiMock.mockResolvedValue({ translatedText: "मैं ठीक हूँ।", sourceLanguage: "Marathi", targetLanguage: "Hindi" });
    renderInStreamContext(textMessage({ id: "msg-b", text: "मी ठीक आहे.", user: { id: "me-id" } }));
    fireEvent.click(screen.getByRole("button", { name: "Translate message to Hindi" }));
    expect(apiMock).toHaveBeenCalledWith({ text: "मी ठीक आहे.", targetLanguage: "hi" });
    prefsState.target = { name: "Marathi", code: "mr" };
  });
});
