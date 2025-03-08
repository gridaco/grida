"use client";
import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Verify() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, phone }),
      });

      if (response.ok) {
        const { referralLink } = await response.json();
        router.push(`/success?link=${encodeURIComponent(referralLink)}`);
      } else {
        setError("인증에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch (err) {
      setError("오류가 발생했습니다. 나중에 다시 시도해 주세요.");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-background rounded-lg p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center">인증하기</h1>
      <p className="text-center text-muted-foreground">
        귀하의 이름과 전화번호를 입력하여 추천 링크를 받으세요.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-muted-foreground"
          >
            이름
          </label>
          <Input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-muted-foreground"
          >
            전화번호
          </label>
          <Input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit">인증하기</Button>
      </form>
    </div>
  );
}
