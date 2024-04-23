import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import Link from "next/link";

export default function FormClosedPage() {
  return (
    <main className="flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md p-4">
        <CardHeader className="flex flex-col items-center">
          <h2 className="text-lg font-bold tracking-tight">Form Closed</h2>
          <p className="text-sm text-center text-gray-500">
            Form is closed. If you believe this is a mistake, please contact
            support.
          </p>
        </CardHeader>
        <CardContent className="p-0" />
        <CardFooter className="flex w-full p-0">
          <Link
            className="flex items-center justify-center w-full p-4 text-sm font-medium text-white bg-blue-600 rounded-b"
            href="#"
          >
            Home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
