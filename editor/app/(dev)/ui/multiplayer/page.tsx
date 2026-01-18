"use client";

import React, { useState, useEffect } from "react";
import { CursorChat } from "@/components/multiplayer/cursor-chat";
import {
  FakeForeignCursor,
  FakeCursorPosition,
} from "@/components/multiplayer/cursor";
import { cursors } from "@/components/cursor/cursor-data";
import {
  ChatEffectsProvider,
  useChatEffects,
} from "@/components/multiplayer/chat-effects";
import { useMultiplayerStore, MultiplayerProvider } from "./store";
import { useMockDemoManager } from "./mock-demo-manager";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function MultiplayerDemoContent() {
  const [messages, setMessages] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });

  // Global store
  const { state } = useMultiplayerStore();
  const { players } = state;
  const {
    initializeDemoPlayers,
    startTypingSimulation,
    startMovementSimulation,
  } = useMockDemoManager();

  const { showEffect } = useChatEffects();

  const handleValueChange = (value: string) => {
    // Handle typing events if needed
  };

  const handleValueCommit = (value: string) => {
    setMessages((prev) => [value, ...prev]);
    // Show fly-away effect
    showEffect(
      value,
      {
        x: bubblePosition.x + 28,
        y: bubblePosition.y + 24,
      },
      {
        fill: "#3b82f6",
        hue: "#1d4ed8",
      }
    );
  };

  // Chat state management
  useHotkeys("/", (e) => {
    e.preventDefault();
    setIsChatOpen(true);
  });

  useHotkeys("escape", () => {
    setIsChatOpen(false);
  });

  // Initialize demo and start simulations
  useEffect(() => {
    initializeDemoPlayers();

    const timeoutId = setTimeout(() => {
      const stopTyping = startTypingSimulation();
      const stopMovement = startMovementSimulation();

      return () => {
        stopTyping();
        stopMovement();
      };
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [initializeDemoPlayers, startTypingSimulation, startMovementSimulation]);

  return (
    <>
      <CursorChat
        open={isChatOpen}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        onClose={() => setIsChatOpen(false)}
      />
      <div
        className="fixed inset-0 bg-background overflow-hidden"
        style={{
          cursor: cursors.default_png.css,
        }}
      >
        {/* Full-screen demo area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold pointer-events-none select-none">
              Multiplayer Chat Demo
            </h1>
            <p className="text-sm text-muted-foreground mt-4 pointer-events-none select-none">
              Players: {players.length}
            </p>
          </div>
        </div>

        {/* Footer content */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
          <p className="text-muted-foreground text-sm">
            Press{" "}
            <Badge variant="outline" className="text-xs">
              /
            </Badge>{" "}
            to open chat anywhere on screen
          </p>
        </div>

        {/* Dynamic Players from Store */}
        {players.map((player) => (
          <FakeCursorPosition
            key={player.id}
            x={player.position.x}
            y={player.position.y}
          >
            <FakeForeignCursor
              color={player.color}
              name={player.name}
              message={player.message}
            />
          </FakeCursorPosition>
        ))}

        {/* Floating Control Panel */}
        <div className="fixed top-4 right-4 w-64 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <Card className="shadow-lg border-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Multiplayer Demo</CardTitle>
              <CardDescription>{players.length} players online</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Players List */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Players</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 p-2 bg-muted rounded text-xs"
                    >
                      <div
                        className="w-3 h-3 rounded-full border"
                        style={{
                          backgroundColor: player.color.fill,
                          borderColor: player.color.hue,
                        }}
                      />
                      <span className="flex-1 truncate">{player.name}</span>
                      {player.message && (
                        <span className="text-muted-foreground truncate max-w-20">
                          &quot;{player.message}&quot;
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Messages History */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">
                    Messages ({messages.length})
                  </h4>
                  {messages.length > 0 && (
                    <Button
                      onClick={() => setMessages([])}
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {messages.length > 0 ? (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {messages
                      .slice()
                      .reverse()
                      .map((message, index) => (
                        <div
                          key={messages.length - 1 - index}
                          className="p-2 bg-muted rounded text-xs"
                        >
                          {message}
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No messages yet
                  </p>
                )}
              </div>

              {/* Quick Instructions */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Shortcuts</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      /
                    </Badge>
                    <span>Open chat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Esc
                    </Badge>
                    <span>Close chat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Enter
                    </Badge>
                    <span>Send message</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function MultiplayerDemoPage() {
  return (
    <MultiplayerProvider>
      <ChatEffectsProvider>
        <MultiplayerDemoContent />
      </ChatEffectsProvider>
    </MultiplayerProvider>
  );
}
