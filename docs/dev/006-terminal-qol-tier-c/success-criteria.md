## Done When

### 1. zsh + zsh-autosuggestions
- [x] zsh installed — `apt install zsh` (v5.9)
- [x] zsh-autosuggestions installed — `apt install zsh-autosuggestions`
- [x] Default shell changed to zsh — `chsh -s /usr/bin/zsh bppc`
- [x] Fish-like inline suggestions working — sourced in .zshrc

### 2. zsh-syntax-highlighting
- [x] zsh-syntax-highlighting installed — `apt install zsh-syntax-highlighting`
- [x] Commands colored as you type — sourced in .zshrc

### 3. Starship prompt
- [x] Starship installed — v1.24.2 via install script
- [x] Initialized in .zshrc — `eval "$(starship init zsh)"`

### 4. Backend updates
- [x] PTY spawns user's $SHELL instead of hardcoded bash — `std::env::var("SHELL")` with fallback
- [x] Command history reads .zsh_history when available, parses zsh extended format
- [x] `cargo check` passes

### Configuration
- [x] `~/.zshrc` created with: history (10K), emacs keybindings, compinit, plugins, NVM, Starship
