"use client";
import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PolestarTypeLogo } from "@/components/logos";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";

export default function TMP_Portal() {
  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <main className="flex w-full h-full flex-col items-center justify-center p-4 bg-gray-100">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md pb-6 space-y-6">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.polestar.com/dato-assets/11286/1725964311-pak_home_image-card_pc.jpeg?q=35&dpr=2&w=542"
                  alt="Polestar 4"
                  className="object-cover aspect-square select-none pointer-events-none rounded-t-lg"
                />
                <PolestarTypeLogo className="absolute top-7 left-1/2 transform -translate-x-1/2 h-[20px] w-auto" />
              </div>
              <div className="flex flex-col gap-3">
                <h1 className="text-xl font-semibold text-center text-gray-800">
                  폴스타 추천 이벤트
                </h1>

                <p className="text-center text-sm text-gray-600">
                  폴스타 오너님을 위한 특별한 추천 이벤트에 참여하세요. <br />{" "}
                  친구나 가족에게 폴스타를 소개하고 특별한 혜택을 받으세요.
                </p>
              </div>
              <div className="flex w-full mx-auto items-center justify-center">
                <Dialog>
                  <DialogTrigger>
                    <Button className=" rounded-none shadow-none">
                      인증 및 링크 받기
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="min-h-screen max-w-none">
                    <Form />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </main>
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function Form() {
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
    <div className="w-full max-w-md bg-white rounded-lg p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center text-gray-800">인증하기</h1>
      <p className="text-center text-gray-600">
        귀하의 이름과 전화번호를 입력하여 추천 링크를 받으세요.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700"
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
            className="block text-sm font-medium text-gray-700"
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
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button type="submit">인증하기</Button>
      </form>
    </div>
  );
}
