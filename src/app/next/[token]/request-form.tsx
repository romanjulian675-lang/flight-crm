"use client";
import { useState } from "react";

export function DiscoveryRequest({ token }: { token: string }) {
  const [state, setState] = useState("idle");
  const [id, setId] = useState("");
  if (state === "done") return <div role="status" className="rounded-lg bg-emerald-50 p-5 text-emerald-900"><h2 className="font-semibold">Request received.</h2><p className="mt-2 text-sm">Our team will contact you to confirm your discovery flight. No flight time or payment has been reserved yet.</p></div>;
  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault(); setState("sending");
    const key = id || crypto.randomUUID(); setId(key);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch(`/api/discovery-request/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, submissionId: key }) });
      if (!r.ok) throw new Error(); setState("done");
    } catch { setState("error"); }
  }}><input name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="!hidden" /><label className="flex flex-col gap-1 text-sm">Name<input name="name" autoComplete="name" maxLength={160} required /></label><label className="flex flex-col gap-1 text-sm">Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label><label className="flex flex-col gap-1 text-sm">Phone (optional, with country code)<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label><label className="flex flex-col gap-1 text-sm">Preferred dates / times<input name="availability" placeholder="For example: next Saturday morning" maxLength={300} required /></label><label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" name="consent" required />Please contact me to arrange my discovery flight. I understand the team must confirm the flight and pricing.</label>{state === "error" && <p role="alert" className="text-sm text-red-700">We couldn’t save your request. Please check your details and try again.</p>}<button className="w-full rounded-lg bg-[#142b43] px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Request my discovery flight"}</button></form>;
}
