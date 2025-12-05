# Mindz - Infinite Canvas Note-Taking App

A modern, offline-first note-taking application with an infinite canvas interface, inspired by Scrintal and Heptabase.

## Features

- **Infinite Canvas**: Pan and zoom across an unlimited workspace
- **Note Cards**: Create, edit, and organize notes on the canvas
- **Offline Support**: Progressive Web App (PWA) that works without internet
- **Modern UI**: Clean, minimalist interface with smooth interactions
- **Drag & Drop**: Move notes around the canvas with ease

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

- **Pan**: Hold Ctrl/Cmd and drag, or use middle mouse button
- **Zoom**: Ctrl/Cmd + Scroll wheel, or use zoom controls in the toolbar
- **Edit Notes**: Double-click on any note card to edit
- **Move Notes**: Click and drag note cards to reposition them

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **PWA** - Offline support via service workers

## Project Structure

```
mindz/
├── src/
│   ├── components/
│   │   ├── HeaderBar.tsx    # Top navigation bar
│   │   ├── Sidebar.tsx       # Left navigation sidebar
│   │   ├── Canvas.tsx        # Infinite canvas component
│   │   ├── NoteCard.tsx      # Individual note card
│   │   └── Toolbar.tsx       # Bottom tool toolbar
│   ├── App.tsx               # Main app component
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles
├── public/                   # Static assets
└── package.json
```

## Future Enhancements

- [ ] Local storage persistence
- [ ] Note linking and connections
- [ ] Tags and categories
- [ ] Search functionality
- [ ] Export/import features
- [ ] Collaborative editing
- [ ] Mobile support

## License

MIT







