export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">404 - 만료된 링크입니다.</h1>
        <p className="mt-4 text-muted-foreground">
          초대가 만료되었거나, 잘못된 링크입니다. 이미 초대를 받으셨나요?
          초대자에게 연락하여 제전송을 요청해 주세요.
        </p>
      </div>
    </div>
  );
}
