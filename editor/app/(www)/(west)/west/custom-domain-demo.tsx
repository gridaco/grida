"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function CustomDomainDemo() {
  const [brand, setBrand] = useState("");

  return (
    <section className="py-20 bg-muted/50">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
            Custom Domains
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Your brand, your identity.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Instantly preview your unique domain powered by Grida WEST. Just
            type your brand or event name to see it come alive.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <section className="flex flex-col items-center gap-6 py-4">
            <div className="relative flex flex-col gap-6 items-center">
              <Image
                src="/www/.west/curve.png"
                alt="Curve arrow"
                width={75}
                height={75}
                className="absolute -left-10 top-6"
              />
              <label className="font-mono font-medium text-muted-foreground">
                What’s your brand or event name?
              </label>

              <input
                type="text"
                placeholder="example"
                defaultValue={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="text-center text-muted-foreground px-2 py-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-200"
              />
            </div>

            <div className="mt-10 w-full max-w-sm md:max-w-3xl bg-white rounded-lg overflow-hidden shadow-xl border border-gray-200 transition-all">
              {/* Terminal header mimic */}
              <div className="flex items-center px-4 py-2 bg-gray-100 border-b border-gray-200">
                <div className="flex space-x-2">
                  <div className="w-4 h-4 rounded-full border border-neutral-200 bg-red-400"></div>
                  <div className="w-4 h-4 rounded-full border border-neutral-200 bg-yellow-400"></div>
                  <div className="w-4 h-4 rounded-full border border-neutral-200 bg-green-400"></div>
                </div>
                <div className="mx-auto text-sm text-gray-500">
                  https://{brand || "example"}.co
                </div>
              </div>
              <div className="flex items-center justify-center py-4 bg-white">
                <ReferralTree />
              </div>
            </div>
          </section>
        </motion.div>
      </div>
    </section>
  );
}

// 노드 데이터 타입 정의
interface Node {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  level: number;
  connections: Array<{
    target: string;
    direction: "right" | "left" | "top" | "bottom";
  }>;
}

// 연결선 데이터 타입 정의
interface Connection {
  id: string;
  from: string;
  to: string;
  path: string;
  level: number;
}

// 노드 데이터 - 이미지와 유사하게 조정
const initialNodes: Node[] = [
  // 첫 번째 열 (1개) - 레벨 1
  {
    id: "node1",
    name: "User",
    position: { x: 3, y: 10 },
    width: 5,
    height: 2.4,
    level: 1,
    connections: [
      { target: "node2", direction: "right" },
      { target: "node3", direction: "right" },
    ],
  },

  // 두 번째 열 (2개) - 레벨 2
  {
    id: "node2",
    name: "A",
    position: { x: 10, y: 7 },
    width: 5,
    height: 2.4,
    level: 2,
    connections: [
      { target: "node4", direction: "right" },
      { target: "node5", direction: "right" },
      { target: "node6", direction: "right" },
    ],
  },
  {
    id: "node3",
    name: "B",
    position: { x: 10, y: 13 },
    width: 5,
    height: 2.4,
    level: 2,
    connections: [
      { target: "node7", direction: "right" },
      { target: "node8", direction: "right" },
    ],
  },

  // 세 번째 열 (5개) - 레벨 3
  {
    id: "node4",
    name: "C",
    position: { x: 17, y: 4 },
    width: 5,
    height: 2.4,
    level: 3,
    connections: [],
  },
  {
    id: "node5",
    name: "D",
    position: { x: 17, y: 8 },
    width: 5,
    height: 2.4,
    level: 3,
    connections: [],
  },
  {
    id: "node6",
    name: "E",
    position: { x: 17, y: 12 },
    width: 5,
    height: 2.4,
    level: 3,
    connections: [],
  },
  {
    id: "node7",
    name: "F",
    position: { x: 17, y: 16 },
    width: 5,
    height: 2.4,
    level: 3,
    connections: [],
  },
  {
    id: "node8",
    name: "G",
    position: { x: 17, y: 20 },
    width: 5,
    height: 2.4,
    level: 3,
    connections: [],
  },
];

function ReferralTree() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [connections, setConnections] = useState<Connection[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [animationKey, setAnimationKey] = useState(0);

  // 직각으로 꺾인 연결선 생성 함수
  const createConnections = useCallback(() => {
    const newConnections: Connection[] = [];

    nodes.forEach((node) => {
      node.connections.forEach((connection) => {
        const targetNode = nodes.find((n) => n.id === connection.target);
        if (!targetNode) return;

        // 시작점과 끝점 계산
        let startX = node.position.x;
        let startY = node.position.y;
        let endX = targetNode.position.x;
        let endY = targetNode.position.y;

        // 연결 방향에 따라 시작점과 끝점 조정
        switch (connection.direction) {
          case "right":
            startX = node.position.x + node.width / 2;
            endX = targetNode.position.x - targetNode.width / 2;
            break;
          case "left":
            startX = node.position.x - node.width / 2;
            endX = targetNode.position.x + targetNode.width / 2;
            break;
          case "top":
            startY = node.position.y - node.height / 2;
            endY = targetNode.position.y + targetNode.height / 2;
            break;
          case "bottom":
            startY = node.position.y + node.height / 2;
            endY = targetNode.position.y - targetNode.height / 2;
            break;
        }

        // 직각으로 꺾인 경로 생성
        let path = "";

        // 노드 간 연결 방향에 따라 경로 생성
        if (
          connection.direction === "left" ||
          connection.direction === "right"
        ) {
          // 수평 방향 연결
          const midX = (startX + endX) / 2;
          path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        } else {
          // 수직 방향 연결
          const midY = (startY + endY) / 2;
          path = `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
        }

        // 연결선 레벨 설정 (1->2 또는 2->3)
        const level = node.level;

        newConnections.push({
          id: `${node.id}-${targetNode.id}`,
          from: node.id,
          to: targetNode.id,
          path,
          level,
        });
      });
    });

    setConnections(newConnections);
  }, [nodes]);

  // 애니메이션 주기적으로 재시작
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimationKey((prev) => prev + 1);
    }, 8000); // 8초마다 애니메이션 재시작

    return () => clearInterval(timer);
  }, []);

  // 초기 연결선 생성
  useEffect(() => {
    createConnections();
  }, [createConnections]);

  // 레벨별 연결선 그룹화
  const level1Connections = connections.filter((conn) => conn.level === 1);
  const level2Connections = connections.filter((conn) => conn.level === 2);

  return (
    <div className="relative mx-auto max-w-5xl overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox="0 0 22 24"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter
            id="purpleShadow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="0.2"
              floodColor="#8596FF"
              floodOpacity="0.5"
            />
          </filter>
        </defs>

        {/* 기본 연결선 (항상 표시) */}
        {connections.map((connection) => (
          <path
            key={`base-${connection.id}`}
            d={connection.path}
            fill="none"
            stroke="#EAEAEA"
            strokeWidth="0.2"
            strokeLinecap="square"
          />
        ))}

        {/* 레벨 1 연결선 애니메이션 (1->2) */}
        {level1Connections.map((connection) => (
          <motion.path
            key={`anim-${connection.id}-${animationKey}`}
            d={connection.path}
            fill="none"
            stroke="#8596FF"
            strokeWidth="0.2"
            strokeLinecap="square"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1],
              opacity: [0.3, 0.8],
            }}
            transition={{
              duration: 2,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* 레벨 2 연결선 애니메이션 (2->3) - 지연 시작 */}
        {level2Connections.map((connection) => (
          <motion.path
            key={`anim-${connection.id}-${animationKey}`}
            d={connection.path}
            fill="none"
            stroke="#8596FF"
            strokeWidth="0.2"
            strokeLinecap="square"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1],
              opacity: [0.3, 0.8],
            }}
            transition={{
              duration: 2,
              ease: "easeInOut",
              delay: 2, // 레벨 1 애니메이션 후 시작
            }}
          />
        ))}

        {/* 노드 렌더링 */}
        {nodes.map((node) => {
          const x = node.position.x - node.width / 2;
          const y = node.position.y - node.height / 2;

          return (
            <g key={node.id}>
              {/* 노드 배경 */}
              <rect
                x={x}
                y={y}
                width={node.width}
                height={node.height}
                rx="0.2"
                fill="white"
                stroke="#C7C7C7"
                strokeWidth="0.05"
                filter="url(#purpleShadow)"
              />

              {/* 노드 텍스트 */}
              <text
                x={node.position.x}
                y={node.position.y}
                fontSize="0.8"
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#333"
              >
                {node.name}
              </text>

              {/* 노드 주변 빛나는 효과 - 레벨에 따라 순차적으로 활성화 */}
              <motion.rect
                x={x}
                y={y}
                width={node.width}
                height={node.height}
                rx="0.2"
                fill="#D8E1FF"
                stroke="white"
                strokeWidth="0.3"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0, 0.6, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 1.5,
                  ease: "easeInOut",
                  delay: node.level === 1 ? 0 : node.level === 2 ? 2 : 4, // 레벨에 따라 지연
                }}
                key={`glow-${node.id}-${animationKey}`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
