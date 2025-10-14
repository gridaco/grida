"use client";

import { useCallback, useRef } from "react";
import { useMultiplayerStore } from "./store";

// Real words for realistic typing
const DEMO_MESSAGES = [
  "Hey everyone!",
  "How's it going?",
  "This is pretty cool",
  "What do you think?",
  "I'm working on something new",
  "Anyone want to collaborate?",
  "This looks amazing!",
  "Great work team",
  "Let's discuss this",
  "I have an idea",
  "What's the plan?",
  "Sounds good to me",
  "Let me know your thoughts",
  "I'm excited about this",
  "This is going to be great",
  "Can't wait to see more",
  "Really impressive work",
  "I love this approach",
  "This is exactly what we needed",
  "Perfect timing!",
  "Let's make this happen",
  "I'm all in",
  "This is fantastic",
  "Great job everyone",
  "I'm here to help",
  "Let's do this together",
  "This is going to be awesome",
  "I'm really excited",
  "This looks promising",
  "Let's keep going",
];

const DEMO_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Kate",
  "Liam",
  "Maya",
  "Noah",
  "Olivia",
  "Paul",
  "Quinn",
  "Ruby",
  "Sam",
  "Tara",
];

const DEMO_COLORS = [
  { fill: "#ef4444", hue: "#dc2626" }, // Red
  { fill: "#8b5cf6", hue: "#7c3aed" }, // Purple
  { fill: "#f59e0b", hue: "#d97706" }, // Orange
  { fill: "#06b6d4", hue: "#0891b2" }, // Cyan
  { fill: "#10b981", hue: "#059669" }, // Green
  { fill: "#f97316", hue: "#ea580c" }, // Orange
  { fill: "#8b5cf6", hue: "#7c3aed" }, // Purple
  { fill: "#ec4899", hue: "#db2777" }, // Pink
  { fill: "#6366f1", hue: "#4f46e5" }, // Indigo
  { fill: "#84cc16", hue: "#65a30d" }, // Lime
];

export function useMockDemoManager() {
  const { state, addPlayer, updatePlayerMessage, updatePlayerPosition } =
    useMultiplayerStore();
  const { players } = state;

  // Use ref to access current players without causing re-renders
  const playersRef = useRef(players);
  playersRef.current = players;

  // Initialize demo players
  const initializeDemoPlayers = useCallback(() => {
    console.log("Initializing demo players...");
    const initialPlayers = [
      {
        name: "Alice",
        color: DEMO_COLORS[0],
        message: null,
        position: { x: 200, y: 150 },
      },
      {
        name: "Bob",
        color: DEMO_COLORS[1],
        message: null,
        position: { x: 400, y: 300 },
      },
      {
        name: "Charlie",
        color: DEMO_COLORS[2],
        message: null,
        position: { x: 600, y: 200 },
      },
      {
        name: "Diana",
        color: DEMO_COLORS[3],
        message: null,
        position: { x: 300, y: 400 },
      },
    ];

    initialPlayers.forEach((player) => {
      console.log("Adding player:", player.name);
      addPlayer(player);
    });
    console.log("Demo players added:", initialPlayers.length);
  }, [addPlayer]);

  // Start random typing simulation
  const startTypingSimulation = useCallback(() => {
    const simulateTyping = (playerId: string, message: string) => {
      let currentMessage = "";
      let index = 0;

      const typeInterval = setInterval(
        () => {
          if (index < message.length) {
            currentMessage += message[index];
            updatePlayerMessage(playerId, currentMessage);
            index++;
          } else {
            clearInterval(typeInterval);
            // Clear message after a delay
            setTimeout(
              () => {
                updatePlayerMessage(playerId, null);
              },
              2000 + Math.random() * 3000
            ); // 2-5 seconds
          }
        },
        80 + Math.random() * 120
      ); // 80-200ms per character
    };

    // Start typing for random players
    const startRandomTyping = () => {
      const currentPlayers = playersRef.current;
      if (currentPlayers.length === 0) return;

      const randomPlayer =
        currentPlayers[Math.floor(Math.random() * currentPlayers.length)];
      const randomMessage =
        DEMO_MESSAGES[Math.floor(Math.random() * DEMO_MESSAGES.length)];

      // Only start typing if player doesn't already have a message
      if (!randomPlayer.message) {
        console.log(`${randomPlayer.name} is typing: "${randomMessage}"`);
        simulateTyping(randomPlayer.id, randomMessage);
      }
    };

    // Start typing every 3-8 seconds
    console.log("Starting typing simulation...");
    const typingInterval = setInterval(
      () => {
        console.log(
          "Typing interval tick, players:",
          playersRef.current.length
        );
        if (playersRef.current.length > 0) {
          startRandomTyping();
        } else {
          console.log("No players available for typing");
        }
      },
      3000 + Math.random() * 5000
    );

    return () => clearInterval(typingInterval);
  }, [updatePlayerMessage]);

  // Movement simulation disabled - only message updates are active
  const startMovementSimulation = useCallback(() => {
    return () => {
      // No-op cleanup
    };
  }, []);

  return {
    players,
    initializeDemoPlayers,
    startTypingSimulation,
    startMovementSimulation,
  };
}
