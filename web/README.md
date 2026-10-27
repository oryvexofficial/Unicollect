# Unicollect web (React)

    cd web && npm install && npm run build     # builds EVERYTHING below
    npm run watch  +  npm run dev              # fake backend on :5173 (panel + /site/) and :5174 (chat)

Outputs (all React, committed so the service works without Node):
- app/static/       Guard panel (served at /)              <- src/panel
- app/chat_static/  Unicollect Chat (LLM, app/chat_app.py)  <- src/llm
- pages/            public site, every page prerendered with React SSR + hydrated <- src/site
- pages/chat/       Guard panel in "pages" mode (scripts/sync_chat.py)

Shared kit (src/shared): InkField (WebGL ink), DotGrid, ClickSpark, InkBurst, BlurText, RotatingText,
DecryptedText, CountUp, StreamWords, Magnet, Spotlight, Tilt, VelocityMarquee, ScrollInk, VoteOrbit,
ScrollLine, StampIn, Backdrop (fixed ink-cloud paper), InkCursor (custom cursor, mouse only),
SmoothScroll (inertial wheel + anchor glide), and the chat shell with visible thinking steps (Thinking.jsx).

## Design (v7: plum night)
Dark only, dark purple + light purple. Surfaces: #0d0916 page, #0f0b1a sidebar, #130e20 chat column, #211939 composer/inputs/menus.
Text: #f1ecff / #c2b7e2 / #8c80ad. Brand: violet #8b5cf6 with lilac #c4b5fd; primary buttons are lilac pills with dark-purple text.
Verdicts keep three semantic colours: safe = green, suspect = amber, toxic = red. All tokens live in src/shared/styles/tokens.css.
Feedback (src/shared/chat/Toast.jsx + styles/feedback.css): stacked typed toasts with countdown + undo action,
and a SweetAlert-style dialog via useConfirm() (self-drawing icon ring) that replaces window.confirm.
Deleting a chat collapses the row smoothly (slide, blur, height) and offers "بازگردانی" (undo).
The censored-text section can be hidden/shown (button on the section + toggle in the actions row).
