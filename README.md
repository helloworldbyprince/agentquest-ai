# AgentQuest — The AI Escape Challenge 🤖🗝️

> **"One Goal. Four Tools. Infinite Possibilities."**

Created for a live presentation at **Google DevFest Ranchi 2026**:  
**"Beyond ChatGPT: Build Your First AI Agent, Live"**

---

## 🌟 What is AgentQuest?

**AgentQuest** is a lightweight, educational puzzle game built to visually demonstrate how an **Autonomous AI Agent** perceives its environment, invokes tools, receives structured observations, and adapts its decision-making in real-time.

A lovable robot is trapped inside a **9 × 9 escape maze**. To successfully escape through the portal, the robot must:
1. **Explore** its immediate surroundings.
2. **Locate and collect** a golden key.
3. **Navigate to and unlock** a locked security door.
4. **Pass through** the open corridor and reach the **Exit portal**.

### ⚠️ Phase 1 Scope
This repository contains **Phase 1: Environment & Tool Protocol**.
- Full visual game engine and 9×9 grid.
- Handcrafted deterministic mazes and student interactive maze editor.
- Strict game rules (walls block movement, locked doors require keys, bounds checking).
- Four production-ready game tools (`look`, `move`, `collect`, `unlock`).
- Manual controls (buttons & keyboard arrow keys) that call the exact same tool API.
- Real-time Activity Log showing real tool inputs and engine responses.
- **NO fake AI or hardcoded scripts pretending to be an LLM.** Phase 2 will plug Google's Gemini API directly into this tool dispatcher.

---

## 🧠 How AgentQuest Demonstrates AI Agents

Most people know LLMs like ChatGPT as text-in, text-out chatbots. But **AI Agents** are fundamentally different: they take actions in an external environment through **Tool Calling** (Function Calling).

```
   ┌────────────────────────────────────────────────────────┐
   │                       1. GOAL                          │
   │      "Find the key, unlock the door, and escape."      │
   └──────────────────────────┬─────────────────────────────┘
                              │
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │                    2. TOOL CALL                        │
   │           Model selects a tool: move("north")          │
   └──────────────────────────┬─────────────────────────────┘
                              │
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │                 3. ENGINE EXECUTION                    │
   │       Game engine validates walls, doors & bounds      │
   └──────────────────────────┬─────────────────────────────┘
                              │
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │                    4. OBSERVATION                      │
   │  Returns JSON: { success: false, reason: "wall" }      │
   └──────────────────────────┬─────────────────────────────┘
                              │
                              ▼
   ┌────────────────────────────────────────────────────────┐
   │                   5. NEXT DECISION                     │
   │   Model adapts strategy: "North is blocked. Move East" │
   └────────────────────────────────────────────────────────┘
```

In Phase 1, the human attendee or presenter drives this loop using the manual controls. Because every button triggers the real tool API, the presenter can point to the **Live Activity Feed** on the projector and say:

> *"Notice how the game engine returned `{ success: false, blockedReason: 'wall' }`? In Phase 2, this exact JSON payload is fed directly back into Gemini so it can choose its next move!"*

---

## 🛠️ The Four Game Tools

Every action inside the game—whether triggered by a keyboard press or an LLM—is executed through one of four pure tool functions in `src/game/tools.js`:

### 1. `look()`
- **Purpose**: Inspects the robot's immediate surroundings.
- **Visibility constraint**: Reveals **only** the robot's current tile and the 4 orthogonally adjacent tiles (North, South, East, West). The robot never sees the full maze at once.
- **Sample Return**:
  ```json
  {
    "tool": "look",
    "success": true,
    "message": "Observed surroundings. Detected: Key under robot (Ready to collect!).",
    "observation": {
      "position": { "row": 1, "col": 1 },
      "currentTile": "key",
      "surroundings": {
        "north": { "type": "wall", "traversable": false },
        "south": { "type": "empty", "traversable": true },
        "east": { "type": "wall", "traversable": false },
        "west": { "type": "wall", "traversable": false }
      },
      "hasKey": false,
      "doorUnlocked": false
    }
  }
  ```

### 2. `move(direction)`
- **Arguments**: `"north"`, `"south"`, `"east"`, or `"west"`.
- **Rules**:
  - Moves the robot exactly 1 tile.
  - Rejects moves into walls (`#`).
  - Rejects moves outside grid bounds (0–8).
  - Rejects moves through a locked door (`D`).
- **Sample Return (Success)**:
  ```json
  {
    "tool": "move",
    "success": true,
    "message": "Robot moved east to (4, 5).",
    "observation": {
      "from": { "row": 4, "col": 4 },
      "position": { "row": 4, "col": 5 },
      "facing": "east"
    }
  }
  ```
- **Sample Return (Blocked)**:
  ```json
  {
    "tool": "move",
    "success": false,
    "message": "Movement blocked by wall at (4, 1).",
    "observation": {
      "position": { "row": 5, "col": 1 },
      "blockedReason": "wall"
    }
  }
  ```

### 3. `collect()`
- **Purpose**: Picks up the golden key.
- **Rule**: Only succeeds if the robot is currently positioned on the key tile. Updates inventory to `hasKey: true`.

### 4. `unlock()`
- **Purpose**: Unlocks the security door.
- **Rules**:
  - Requires the robot to hold the key (`hasKey: true`).
  - Requires the robot to be orthogonally adjacent to the door.
  - Changes the door tile state to open, allowing subsequent `move()` calls to cross through it.

---

## 🗺️ Handcrafted Deterministic Mazes

AgentQuest includes three pre-designed mazes in `src/game/mazes.js`:
1. **Beginner Maze**: A gentle U-shaped layout with clear corridors and a single central security door.
2. **Explorer Maze (Default)**: Winding corridors, exploration dead-ends, and a central checkpoint separating the key chamber from the exit.
3. **Challenge Maze**: A tight zig-zag labyrinth requiring multi-step spatial navigation.

All three mazes are mathematically verified by automated pathfinding tests to ensure:
- The Key is reachable from Start.
- The Door is reachable after obtaining the Key.
- The Exit is reachable after unlocking the Door.
- **The locked door is an essential choke point (no alternate paths bypass the door).**

---

## ✏️ Student Edit Mode

Before a mission starts, the audience can interactively customize the challenge:
1. Click **"Edit Maze"** on the toolbar.
2. Select an entity tool:
   - **Place Robot Start** (automatically repositions existing start)
   - **Place Wall** / **Erase Wall**
   - **Place Key** (ensures exactly 1 key)
   - **Place Door** (ensures exactly 1 door)
   - **Place Exit** (ensures exactly 1 exit)
3. Click any tile on the 9×9 board.
4. The real-time validator updates immediately:
   - `Maze Ready` (Green) if solvable and valid.
   - Specific warning message (Amber) if the maze is unsolvable or blocked.
5. Click **"Restore Preset"** anytime to reset back to the default challenge.

---

## 💻 Tech Stack

- **React 19**
- **Vite 6**
- **Node.js + Express 5** (Lightweight backend for Gemini API authentication)
- **Google Gen AI SDK (`@google/genai`)** (Current official SDK, never exposing keys to client)
- **JavaScript (ES Modules)**
- **Pure CSS / Modern Design Tokens** (no bloated CSS frameworks)
- **Lucide React** (crisp UI icons)
- **Vitest** (automated rule & backend API testing)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ (Tested on Node v20 & v24)
- npm 9+
- Google Gemini API Key (Get one from [Google AI Studio](https://aistudio.google.com/))

### 2. Installation
```bash
git clone <repo-url> agentquest-devfest
cd agentquest-devfest
npm install
```

### 3. Configure Gemini API Key
Copy the template environment file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and insert your API key:
```env
GEMINI_API_KEY=AIzaSy...your_real_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```
> **Security Note:** `.env` is ignored by Git in `.gitignore`. Never use `VITE_` prefixed variables for secret keys as Vite embeds them into client-side JS bundles.

### 4. Start the Application

In **Terminal 1** (Start Express Backend):
```bash
npm run server
```
Server starts on `http://localhost:3001` with endpoints:
- `GET /api/health` → checks server status.
- `POST /api/gemini/test` → validates Gemini API connection.

In **Terminal 2** (Start Frontend):
```bash
npm run dev
```
Open your browser at `http://localhost:5173`. Click **"Test AI Connection"** in the header to verify live communication with Gemini!

### 5. Run Automated Tests
```bash
npm test
```
Runs 27 automated tests covering game mechanics, solvability, presets, and backend connection handling without exposing credentials.

### 6. Build for Production
```bash
npm run build
```
Creates an optimized, standalone static bundle in `dist/`.

---

## 🎮 How to Play

- **D-Pad / Buttons**: Click **Up**, **Down**, **Left**, **Right** on the controls panel.
- **Keyboard Shortcuts**:
  - `↑` / `W`: Move North
  - `↓` / `S`: Move South
  - `←` / `A`: Move West
  - `→` / `D`: Move East
  - `L`: `look()`
  - `C`: `collect()`
  - `U`: `unlock()`
- **Activity Feed**: Watch the right-hand panel log every tool call with timestamps and expandable observation JSON.
- **Mission Controls**:
  - **Start Mission**: Begins timer and locks maze editing.
  - **Pause / Resume**: Pauses elapsed timer and freezes robot controls.
  - **Reset Maze**: Restores the robot to start, resets items, and clears logs.

---

## 🔮 Phase 2 Roadmap: Gemini API Tool-Calling

In Phase 2, we will connect Google's **Gemini API** (`gemini-2.5-flash` or `gemini-1.5-pro`) to this game via real function declarations:

```javascript
const agentQuestTools = [
  {
    name: "look",
    description: "Inspect immediate surroundings of the robot (4 adjacent tiles).",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "move",
    description: "Move the robot 1 tile in a direction.",
    parameters: {
      type: "OBJECT",
      properties: {
        direction: { type: "STRING", enum: ["north", "south", "east", "west"] }
      },
      required: ["direction"]
    }
  },
  {
    name: "collect",
    description: "Pick up the key from the current tile.",
    parameters: { type: "OBJECT", properties: {} }
  },
  {
    name: "unlock",
    description: "Unlock an adjacent security door while holding the key.",
    parameters: { type: "OBJECT", properties: {} }
  }
];
```

Because `src/game/tools.js` and `src/game/engine.js` are completely decoupled from React presentation logic, the Gemini execution loop will simply call `dispatchToolCall(state, call.name, call.args)` and pass the observation back to the model!

---

## 📄 License

MIT License. Created with ❤️ for Google DevFest Ranchi 2026.

