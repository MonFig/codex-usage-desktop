cask "codex-usage-desktop" do
  arch arm: "arm64", intel: "x64"

  version "4.2.0"
  sha256 arm:   "ea129c7ea483935028482bcb8c11229c01f9535f66100e3246aea89d194e2e1a",
         intel: "4c6d43ccda5bf84ac0bbbb2851e13a4aec703b70fbad0c44706c88bc1c5182c7"

  url "https://github.com/itvincent-git/codex-usage-desktop/releases/download/app-v#{version}/codex-usage-desktop-macos-#{arch}.dmg"
  name "Codex Usage Desktop"
  desc "Local-first dashboard for Codex CLI token usage and cost estimates"
  homepage "https://github.com/itvincent-git/codex-usage-desktop"

  depends_on :macos

  app "Codex Usage Desktop.app"

  zap trash: [
    "~/Library/Application Support/com.ccusage.codex.desktop",
    "~/Library/Caches/com.ccusage.codex.desktop",
    "~/Library/Logs/com.ccusage.codex.desktop",
    "~/Library/Preferences/com.ccusage.codex.desktop.plist",
    "~/Library/Saved Application State/com.ccusage.codex.desktop.savedState",
  ]
end
