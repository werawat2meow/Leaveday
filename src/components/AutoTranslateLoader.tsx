"use client";
import { useEffect } from "react";

export default function AutoTranslateLoader() {
  useEffect(() => {
    if ((window as any).__gtLoaded) return;
    (window as any).__gtLoaded = true;

    (window as any).googleTranslateElementInit = () => {
      // eslint-disable-next-line no-new
      new (window as any).google.translate.TranslateElement(
        {
          pageLanguage: "auto",
          // 👇 เพิ่มภาษาที่อยากให้เลือกได้
          includedLanguages: "th,en,my,zh-CN,zh-TW",
          autoDisplay: false,
        },
        "google_translate_element"
      );

      // ซ่อน banner แปลของ Google
      const hide = () => {
        const b1 = document.querySelector<HTMLIFrameElement>("iframe.goog-te-banner-frame");
        const w1 = document.querySelector<HTMLElement>(".skiptranslate");
        if (b1) b1.style.display = "none";
        if (w1) w1.style.display = "none";
        document.documentElement.style.marginTop = "0px";
        document.body.style.top = "0px";
        document.body.style.position = "static";
      };
      hide();
      setTimeout(hide, 100);
      window.addEventListener("resize", hide);
    };

    const s = document.createElement("script");
    s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.body.appendChild(s);

    return () => {
      s.remove();
      window.removeEventListener("resize", () => {});
    };
  }, []);

  // ถ้าไม่อยากให้เห็น widget จริง ก็ซ่อนไว้ได้เลย
  return <div id="google_translate_element" style={{ display: "none" }} />;
}
