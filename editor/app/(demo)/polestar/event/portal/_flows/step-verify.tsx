"use client";
import React from "react";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/extension/phone-input";
import data from "./data.json";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface KBA {
  name: string;
  phone: string;
}

export default function Verify() {
  const router = useRouter();
  const { control, register, handleSubmit } = useForm<KBA>({
    defaultValues: { name: "", phone: "" },
  });

  const onSubmit = async (formData: KBA) => {
    const response = await fetch(
      "/p/access/cd2ed862-246d-453b-a48f-4d8da11c4fae",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      }
    );

    if (response.ok) {
      const result = await response.json();
      console.log(result);
      const tid = result.data.customer.metadata["polestar-transaction-id"];
      router.replace(`https://demo.grida.co/polestar/event/invite/${tid}`);
    } else {
      toast.error("인증 실패");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-background rounded-lg p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center">{data.form.title}</h1>
      <p className="text-center text-muted-foreground">
        {data.form.description}
      </p>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-muted-foreground"
          >
            성함
          </label>
          <Input
            id="name"
            placeholder="홍길동"
            {...register("name", { required: true })}
          />
        </div>

        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-muted-foreground"
          >
            휴대번호
          </label>
          <Controller
            name="phone"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <PhoneInput
                id="phone"
                defaultCountry="KR"
                placeholder="01012345678"
                required
                {...field}
              />
            )}
          />
        </div>

        <Button type="submit">인증하기</Button>
      </form>
    </div>
  );
}
