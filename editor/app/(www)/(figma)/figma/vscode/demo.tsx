"use client";

import { useState, useEffect, useRef } from "react";
import { CodeIcon } from "lucide-react";
import Editor from "@monaco-editor/react";
import Image from "next/image";

const codeSnippets = {
  react: {
    src: `import styled from "@emotion/styled";
import React from "react";

export default function MusicHome() {
  return (
    <Wrapper>
      <Body>
        <TopSpacer />
        <HeaderPart />
        <PrimaryMusicCardsListPart />
        <FriendsMusicSectionPart />
        <TabBar />
      </Body>
    </Wrapper>
  );
}

const HeaderPart = () => {
  return (
    <SectionHeader>
      <HeaderSection>
        <TitleAndAvatar>
          <Title>Saturday Morning Mix</Title>
          <AvatarSource
            src="https://example.com/avatar.jpg"
            alt="image of AvatarSource"
          />
        </TitleAndAvatar>
        <Subtitle>
          Here are some tunes for you to start your morning. Mostly quiet and
          slow-beat, some of them are mood changer.
        </Subtitle>
      </HeaderSection>
    </SectionHeader>
  );
};`,
    language: "typescript",
  },

  flutter: {
    src: `Column(
  mainAxisSize: MainAxisSize.min,
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Text(
      "Saturday Morning Mix",
      style: TextStyle(
        fontSize: 36,
        fontWeight: FontWeight.w700,
        fontFamily: "Sen",
      ),
    ),
    Image.network(
      "https://example.com/avatar.jpg",
      width: 48,
      height: 48,
    ),
    Text(
      "Here are some tunes for you to start your morning. Mostly quiet and slow-beat, some of them are mood changer.",
      style: TextStyle(
        color: Color(0xffa3a3a3),
        fontSize: 14,
        fontWeight: FontWeight.w400,
      ),
    ),
  ],
);`,
    language: "dart",
  },

  vanilla: {
    src: `<!DOCTYPE html>
<html>
  <body>
    <div id="Wrapper">
      <h1>Saturday Morning Mix</h1>
      <img src="https://example.com/avatar.jpg" alt="avatar" />
      <p>
        Here are some tunes for you to start your morning. Mostly quiet and slow-beat,
        some of them are mood changer.
      </p>
    </div>
  </body>
</html>`,
    language: "html",
  },
};

export default function CodeTabs() {
  const [activeTab, setActiveTab] =
    useState<keyof typeof codeSnippets>("react");
  const [displayedCode, setDisplayedCode] = useState("");

  const typingSpeed = 5;
  const codeRef = useRef("");
  const charIndexRef = useRef(0);

  useEffect(() => {
    codeRef.current = codeSnippets[activeTab].src;
    charIndexRef.current = 0;
    setDisplayedCode("");

    let plainTextIndex = 0;

    const typeCode = () => {
      if (plainTextIndex < codeRef.current.length) {
        const charsToAdd = Math.min(
          typingSpeed,
          codeRef.current.length - plainTextIndex
        );
        plainTextIndex += charsToAdd;
        const current = codeRef.current.substring(0, plainTextIndex);
        // const escaped = formatCode(current);
        setDisplayedCode(current);
        requestAnimationFrame(typeCode);
      }
    };

    requestAnimationFrame(typeCode);

    return () => {
      plainTextIndex = codeRef.current.length;
    };
  }, [activeTab]);

  const tabs = [
    { id: "react", label: "react.tsx" },
    { id: "flutter", label: "flutter.dart" },
    { id: "vanilla", label: "vanilla.html" },
  ];

  return (
    <div className="w-full max-w-screen-xl mx-auto rounded-lg overflow-hidden border border-neutral-700 shadow-lg bg-neutral-800 text-white">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-neutral-700 border-b border-neutral-600">
        <div className="flex gap-1.5">
          <div className="w-4 h-4 rounded-full bg-red-400 border border-neutral-800" />
          <div className="w-4 h-4 rounded-full bg-yellow-400 border border-neutral-800" />
          <div className="w-4 h-4 rounded-full bg-green-400 border border-neutral-800" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Image placeholder */}
        <div className="w-full md:w-1/2 bg-neutral-800 text-black p-4 overflow-auto">
          <div className="w-full h-[800px] flex items-center justify-center">
            <Image
              src="/www/.figma/vscode/hero-demo.png"
              alt="vscode mobile"
              width={400}
              height={500}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>

        {/* Code area */}
        <div className="w-full md:w-1/2 bg-neutral-800 flex flex-col">
          <div className="flex border-b border-neutral-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() =>
                  setActiveTab(tab.id as keyof typeof codeSnippets)
                }
                className={`flex items-center px-4 py-2 text-sm ${
                  activeTab === tab.id
                    ? "text-white bg-neutral-700"
                    : "text-neutral-500 bg-neutral-800 hover:bg-neutral-900"
                }`}
              >
                <CodeIcon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 h-[600px] overflow-auto">
            <Editor
              options={{
                readOnly: true,
                padding: {
                  top: 16,
                },
              }}
              language={codeSnippets[activeTab].language}
              theme="vs-dark"
              value={displayedCode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
