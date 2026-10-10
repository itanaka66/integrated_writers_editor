import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import SettingsPanel from "./components/SettingsPanel";
import { DICTIONARIES, I18nProvider, LanguageCode } from "./lib/i18n";
import { api } from "./lib/api";
import { Project } from "./lib/types";

vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const project: Project = { id: 1, name: "P", description: "", genre: "", rules: "", style_guide: "x" };
const LANGS: LanguageCode[] = ["en", "ja", "zh"];

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ username: "tanaka", email: null, is_admin: true, is_active: true, created_at: "2026-01-01T00:00:00Z" });
    return Promise.resolve([]);
  });
});

// The login screen is the only place a language is chosen: nothing in the
// logged-in workspace may offer a language picker.
function expectNoLanguageSwitcher() {
  expect(screen.queryByRole("combobox", { name: /language/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /^(English|日本語|简体中文|한국어|Español|Français|Deutsch|Português)$/ })).not.toBeInTheDocument();
}

describe.each(LANGS)("Sidebar in %s", (code) => {
  it("renders the translated navigation and has no language switcher", () => {
    render(
      <I18nProvider language={code}>
        <Sidebar project={project} section="home" onSection={() => {}} onDashboard={() => {}} />
      </I18nProvider>,
    );
    const d = DICTIONARIES[code];
    expect(screen.getByText(d["nav.write"])).toBeInTheDocument();
    expect(screen.getByText(d["sidebar.toDashboard"])).toBeInTheDocument();
    expect(screen.getByText(d["sidebar.logout"])).toBeInTheDocument();
    expectNoLanguageSwitcher();
  });
});

describe.each(LANGS)("Dashboard in %s", (code) => {
  it("greets in the active language and has no language switcher", async () => {
    render(<I18nProvider language={code}><Dashboard onOpen={() => {}} /></I18nProvider>);
    const d = DICTIONARIES[code];
    await waitFor(() => expect(screen.getByText(d["dashboard.greeting"].replace("{name}", "tanaka"))).toBeInTheDocument());
    expect(screen.getByText(d["dashboard.newProject"])).toBeInTheDocument();
    expectNoLanguageSwitcher();
  });
});

describe("Dashboard greeting, concrete strings", () => {
  it("reads naturally in Chinese and English", async () => {
    const { unmount } = render(<I18nProvider language="zh"><Dashboard onOpen={() => {}} /></I18nProvider>);
    await waitFor(() => expect(screen.getByText("你好，tanaka")).toBeInTheDocument());
    unmount();
    render(<I18nProvider language="en"><Dashboard onOpen={() => {}} /></I18nProvider>);
    await waitFor(() => expect(screen.getByText("Hello, tanaka")).toBeInTheDocument());
  });
});

describe("SettingsPanel under a non-Japanese language", () => {
  it.each(["de", "ko"] as LanguageCode[])("renders translated tabs and the style-guide picker in %s", (code) => {
    render(<I18nProvider language={code}><SettingsPanel project={project} onSaved={() => {}} /></I18nProvider>);
    const d = DICTIONARIES[code];
    expect(screen.getByRole("heading", { name: d["settings.title"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d["settings.tab.connection"] })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d["settings.tab.backup"] })).toBeInTheDocument();
    expect(screen.queryByText("設定")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: d["settings.basic.generate"] }));
    expect(screen.getByRole("heading", { name: d["settings.picker.title"] })).toBeInTheDocument();
    expect(screen.getByText(d["settings.cat.pr.label"])).toBeInTheDocument();
    expectNoLanguageSwitcher();
  });
});
