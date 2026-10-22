import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { finishPassportLogin } from "./api";

export function PassportCallback() {
  const [message, setMessage] = useState("正在为 NaviPlan 建立安全会话...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    finishPassportLogin()
      .then((returnTo) => window.location.replace(returnTo))
      .catch((error) => {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "登录失败，请返回后重试。");
      });
  }, []);

  return (
    <main className="passport-callback-shell">
      <section className="passport-callback-panel" aria-live="polite">
        <LoaderCircle className={failed ? "" : "is-spinning"} size={28} aria-hidden="true" />
        <h1>{failed ? "未能连接 NaviPassport" : "正在连接 NaviPassport"}</h1>
        <p>{message}</p>
        {failed && <a href={import.meta.env.BASE_URL}>返回 NaviPlan</a>}
      </section>
    </main>
  );
}
