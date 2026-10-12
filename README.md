 VitalSign

Hands-free monitoring & request system for bed-ridden and elderly patients, using gestures, face awareness and live nurse alerts.

 Overview

Bed-ridden and elderly patients often can't reach a call button or phone, and family members can't watch them every moment. VitalSign turns an ordinary bedside webcam into a contactless call system. It recognises hand gestures and face state in the browser and sends structured requests (text and live photos) straight to the attendant's phone through Telegram.

It runs 100% in the browser, with no installation, no backend and no extra hardware beyond a webcam.

Features
 Gesture requests
Eight distance-friendly gestures map to common patient needs:

| Gesture | Request |

| ☝️ Point Up | Water |
| ✊ Fist | Washroom |
| ✌️ Victory | **Emergency** |
| 👍 Thumbs Up | Yes / OK |
| 👎 Thumbs Down | No |
| 👌 OK Sign | Medicine |
| 🖐️ Open Hand | Call Nurse |
| 🖖 Three Fingers | Feeling Cold |

 Monitoring layer
- Sleep / Wake detection:** eyes closed for about 8 seconds triggers a `SLEEPING` alert, and the attendant is notified when the patient wakes up.
- Face status:** if no face is in frame, the status shows `NOT VISIBLE` instead of wrongly marking the patient as awake.
- Emergency mode:** a full-screen alarm, a sound and an automatic live photo sent to the attendant.
- Attendant photo pull:** the attendant sends `photo`, `/photo`, `snap` or `see` on Telegram and gets a live snapshot.
- Two-way chat:** the patient types messages to the attendant, and the attendant's replies are spoken aloud using text-to-speech.

Accident-proof design
- Gesture must be **held for about 0.9 s** to confirm
- **Cooldown of about 4.5 s** between requests to prevent spam
- **Detection confidence of about 0.65–0.7** required
- Unclear or ambiguous poses are ignored

#How it works

```
Webcam (640×480) → MediaPipe (Hands + Face Mesh) → Logic (hold · cooldown · EAR rules) → Telegram (text + photo)
```

1. Capture the live video and detect hand and face landmarks.
2. Classify the gesture using rule-based logic.
3. Hold for about 0.9 s to confirm the gesture.
4. Send the alert or photo, or ignore the input.

**Key parameters**

| Parameter | Value |
|---|---|
| Detection confidence | ≥ ~0.65–0.7 |
| Hold time | ~0.9 s |
| Cooldown | ~4.5 s |
| EAR threshold (eyes closed) | ~0.19 |
| Sleep threshold | ~8 s of closed eyes |
| No face landmarks | `NOT VISIBLE` |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript |
| Vision | MediaPipe Hands + Face Mesh |
| Camera | Browser + WebRTC |
| Alerts | Telegram Bot API (text + photo) |
| Speech | Web Speech API (text-to-speech) |

## Project structure

```
VitalSign/
├── index.html   # UI layout
├── style.css    # Styling and dashboard
└── script.js    # Gesture/face logic, Telegram integration
```

## Getting started

### Prerequisites
- A laptop or tablet with a webcam
- A modern browser (**Chrome** or **Edge** recommended)
- A Telegram account
- Internet connection (for MediaPipe assets and the Telegram API)

### 1. Create a Telegram bot
1. Open Telegram and chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts to get your **Bot Token**.
3. Start a chat with your new bot (or add it to a group with the attendant).
4. Find your **Chat ID**, for example by messaging [@userinfobot](https://t.me/userinfobot) or calling the bot's `getUpdates` endpoint.

### 2. Run the app
1. Clone or download this repository.
2. Open `index.html` in Chrome or Edge.
3. Enter your **Bot Token** and **Chat ID**.
4. Allow camera access when prompted.

### 3. Use it
- Show a gesture to the camera and hold it for about 1 second.
- The attendant receives the request on Telegram.
- Show the Emergency gesture (✌️) to trigger the alarm and an automatic live photo.
- As the attendant, send `photo` to the bot at any time to see the patient live.

> **Note:** Keep your Bot Token private. Do not commit it to a public repository.

## Use cases
- Home care for bed-ridden and elderly patients
- Post-operative recovery at home
- Small clinics and nursing homes
- Any setting with an existing laptop or tablet and webcam

## Feasibility
- **Cost:** any webcam and a free software stack
- **Deploy:** open `index.html`, with no server or install
- **Skills:** JavaScript and MediaPipe
- **Built in:** under 24 hours

## Future scope
- Multi-patient dashboard
- Integration with hospital nurse-call systems
- Per-user gesture tuning
- Mobile / tablet-optimised UI
- Voice + gesture hybrid mode
- Optional offline fallback alerts
- Privacy-preserving local-only mode
- Pilot with a local home-care provider or clinic

