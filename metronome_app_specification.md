# Product Requirements Document (PRD) & Technical Spec
**Project:** Advanced Drummer's Subdivision Metronome
**Document Version:** 1.1

## 1. System Overview
A web-based, mobile-friendly metronome application tailored for drummers. The core concept revolves around a mixer-style interface that allows users to break down and construct rhythms by independently controlling the volume of different rhythmic subdivisions.

## 2. Technical Architecture
*   **Audio Engine:** **Web Audio API** is strictly required. 
    *   Sample-based playback (loading audio files into `AudioBuffer`).
    *   Precise timing must be achieved using `AudioContext.currentTime` and lookahead scheduling (scheduling notes in advance). 
    *   **Do not** use `setInterval` or `setTimeout` for direct audio playback to prevent timing jitter.
*   **Platform:** Progressive Web App (PWA) to allow installation on mobile devices and tablets, providing a fullscreen, app-like experience.
*   **Device APIs:** Use the **Screen Wake Lock API** to prevent the device screen from turning off while the metronome is running.

## 3. User Interface (UI)
The interface is designed to be touch-friendly for quick adjustments during practice.

### 3.1 Master Transport (Top Section)
*   **BPM Display:** Large, highly visible numeric display of the current tempo.
*   **Tempo Controls:** `+` and `-` buttons for fine-tuning (increments of 1) and coarse tuning (increments of 5).
*   **Tap Tempo:** A large button that calculates the BPM based on the average interval of the user's recent taps.
*   **Play/Stop Button:** A prominent toggle to start and stop the audio engine.

### 3.2 Subdivision Mixer (Middle Section)
This section contains independent channels for different subdivisions.
*   **Channels:**
    1.  Quarter Notes (1/4 - The main pulse)
    2.  Eighth Notes (1/8)
    3.  Eighth-Note Triplets (1/8T)
    4.  Sixteenth Notes (1/16)
*   **Channel Controls (Per Channel):**
    *   **Stepped Volume Control:** A 4-step vertical slider or toggle selector representing distinct volume states:
        *   Level 0: Off / Mute (0% volume)
        *   Level 1: Low (Background texture, ~30% volume)
        *   Level 2: Medium (~70% volume)
        *   Level 3: High (Accent/Main focus, 100% volume)
    *   **Sound Selector:** A simple dropdown or icon toggle to assign a specific sample to the channel (e.g., Cowbell, Click, Shaker, Woodblock).
    *   **Visual Indicator (LED):** A UI element that flashes in sync with the audio output of that specific subdivision.

### 3.3 Practice Modules (Bottom Section)
*   **Speed Trainer:**
    *   Inputs: Starting BPM, Target BPM, Step Increase (e.g., +2 BPM), Bars per Step (e.g., every 4 bars).
    *   Automatically increments the master tempo without manual intervention.
*   **Time Check / Drop-out:**
    *   Inputs: Active Bars (e.g., 3 bars), Muted Bars (e.g., 1 bar).
    *   Mutes the audio entirely for the specified duration while keeping the internal clock running, forcing the user to rely on their internal timing.

## 4. Data & Storage
*   **Local State:** Use `localStorage` to save the last used settings (BPM, channel volume steps, selected sounds) so the app restores its state upon reload.
*   **Presets:** Allow users to save current mixer configurations as named JSON objects (e.g., "Triplet Warmup", "Sixteenth Groove") and recall them later.

## 5. Future Scope (Phase 2)
*   **Complex Polyrhythms:** Allow setting different time signatures or loop lengths per channel (e.g., 3 over 4).
*   **Accent Sequencer:** A step-sequencer interface to program specific loud/soft accents within a subdivision loop.
*   **MIDI Out:** Send MIDI clock and note data to trigger external hardware or DAW software.