import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

const HANDLE = "integrated-writers-editor";
const DEV_TOOL_ID = "tool-dev-integrated-writers-editor";

async function main() {
  const status = document.getElementById("status");
  const button = document.getElementById("primary-btn");

  if (!status || !button) return;

  let anna;
  try {
    anna = await AnnaAppRuntime.connect();
  } catch {
    status.textContent = "Standalone preview: Anna host is not available.";
    return;
  }

  const toolId =
    window.__ANNA_TOOL_IDS__?.[HANDLE] || DEV_TOOL_ID;

  try {
    await anna.window.set_title({
      title: "Integrated Writers Editor"
    });
    status.textContent = "Connected. Ready to test Executa.";
  } catch (error) {
    status.textContent = "Connected, but window setup failed: " + error.message;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Calling Executa…";

    try {
      const result = await anna.tools.invoke({
        tool_id: toolId,
        method: "ping",
        args: {}
      });
      status.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      status.textContent = "Executa error: " + error.message;
    } finally {
      button.disabled = false;
    }
  });
}

main();