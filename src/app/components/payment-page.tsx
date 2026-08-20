import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";

type PublicInfo = {
  payment_intent: {
    id: string;
    status: string;
    intent_type: string;
    amount: number;
    currency: string;
    created_at: string;
  };
  invoice: {
    id: string;
    invoice_number: string;
    invoice_type: string;
    amount: number;
    currency: string;
    status: string;
    paid_at: string | null;
  } | null;
  momo: {
    payee_number: string;
    amount: number;
    currency: string;
  };
  brand?: {
    name: string;
    logo_url: string;
  };
  pricing?: {
    usd_amount: number;
    usd_rwf_rate: number;
    vat_rate: number;
    net_amount: number;
    vat_amount: number;
    total_amount: number;
    currency: string;
  };
  pay_url: string;
};

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; info: PublicInfo };

export default function PaymentPage() {
  const { tenant, paymentIntentId } = useParams<{ tenant: string; paymentIntentId: string }>();
  const [searchParams] = useSearchParams();
  const accessToken = searchParams.get("access_token") || "";
  const apiBase = (import.meta.env.VITE_PAYMENT_API_BASE_URL as string | undefined) || "";

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [txId, setTxId] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-RW", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));

  useEffect(() => {
    const load = async () => {
      if (!apiBase) {
        setState({ kind: "error", message: "Payment service is not configured." });
        return;
      }
      if (!paymentIntentId) {
        setState({ kind: "error", message: "Missing payment link." });
        return;
      }
      try {
        const q = new URLSearchParams({ payment_intent_id: paymentIntentId });
        if (accessToken) q.set("access_token", accessToken);
        const res = await fetch(`${apiBase}/payments/public/info?${q.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load payment");
        setState({ kind: "ready", info: json as PublicInfo });
      } catch (err: any) {
        setState({ kind: "error", message: String(err?.message ?? err) });
      }
    };
    void load();
  }, [apiBase, paymentIntentId, accessToken]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== "ready") return;
    if (!txId.trim()) {
      setSubmitError("Enter the Transaction ID from your MoMo SMS.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`${apiBase}/payments/public/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payment_intent_id: state.info.payment_intent.id,
          access_token: accessToken,
          momo_transaction_id: txId.trim(),
          payer_phone: payerPhone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Confirmation failed");
      setTxId("");
      setPayerPhone("");
      const q = new URLSearchParams({ payment_intent_id: state.info.payment_intent.id });
      if (accessToken) q.set("access_token", accessToken);
      const infoRes = await fetch(`${apiBase}/payments/public/info?${q.toString()}`);
      const infoJson = await infoRes.json().catch(() => null);
      if (infoJson?.payment_intent) setState({ kind: "ready", info: infoJson });
    } catch (err: any) {
      setSubmitError(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  };

  const isPaid = state.kind === "ready" && state.info.payment_intent.status === "completed";
  const isAwaiting = state.kind === "ready" && state.info.payment_intent.status === "pending_confirmation";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#F7F9FB", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <div className="w-full max-w-[520px]">
        <Card className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ border: "1px solid rgba(11, 28, 45, 0.12)", boxShadow: "0 6px 28px rgba(11, 28, 45, 0.1)" }}>
          {/* Header */}
          <div className="px-8 py-7 flex items-center justify-center" style={{ backgroundColor: "#0a1929" }}>
            {state.kind === "ready" && state.info.brand?.logo_url ? (
              <img
                src={state.info.brand.logo_url}
                alt={state.info.brand.name || "InDataFlow"}
                className="h-14 w-auto object-contain"
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#0B1C2D" }}>
                  <span className="text-white text-sm font-bold">ID</span>
                </div>
                <span className="text-white font-semibold">InDataFlow</span>
              </div>
            )}
          </div>

          {state.kind === "loading" && (
            <div className="px-8 py-16 flex items-center justify-center text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          )}

          {state.kind === "error" && (
            <div className="px-8 py-16 space-y-3 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto text-red-500" />
              <p className="text-gray-700 font-medium">{state.message}</p>
              {!accessToken && (
                <p className="text-sm text-gray-500">
                  This payment link is missing its access token. Use the link from your invoice email.
                </p>
              )}
            </div>
          )}

          {state.kind === "ready" && (
            <>
              <div className="px-8 pt-8 pb-6">
                <h1 className="text-2xl font-semibold text-gray-900 capitalize">
                  {tenant ? decodeURIComponent(tenant) : "Payment"}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  {state.info.invoice?.invoice_number || state.info.payment_intent.id.slice(0, 8)}
                </p>
              </div>

              {/* Invoice Summary */}
              <div className="px-8 pb-6">
                <div className="rounded-lg p-6 space-y-3" style={{ backgroundColor: "#F7F9FB", border: "1px solid rgba(11, 28, 45, 0.12)" }}>
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-medium" style={{ color: "#5A6B7D" }}>
                      Total to pay
                    </span>
                    <span className="text-2xl font-bold" style={{ color: "#0B1C2D" }}>
                      {formatCurrency(state.info.momo.amount)} {state.info.momo.currency}
                    </span>
                  </div>
                  <div className="h-px" style={{ backgroundColor: "rgba(11, 28, 45, 0.12)" }} />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Monthly subscription</span>
                    <span className="text-gray-900 font-medium">
                      {formatCurrency(state.info.pricing?.net_amount ?? state.info.momo.amount)}{" "}
                      {state.info.momo.currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">
                      VAT ({Math.round((state.info.pricing?.vat_rate ?? 0.18) * 100)}%)
                    </span>
                    <span className="text-gray-500">
                      {formatCurrency(state.info.pricing?.vat_amount ?? 0)} {state.info.momo.currency}
                    </span>
                  </div>
                  {state.info.pricing?.usd_rwf_rate ? (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Rate (current)</span>
                      <span className="text-gray-500">
                        1 USD ≈ {formatCurrency(state.info.pricing.usd_rwf_rate)} RWF
                      </span>
                    </div>
                  ) : null}
                  {state.info.pricing?.usd_amount ? (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Plan price</span>
                      <span className="text-gray-500">
                        ≈ USD {formatCurrency(state.info.pricing.usd_amount)} / month
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {isPaid ? (
                <div className="px-8 pb-8">
                  <div className="bg-green-50 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-[#22C55E] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-900 font-medium">Payment received</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {state.info.invoice?.paid_at
                          ? `Paid on ${new Date(state.info.invoice.paid_at).toLocaleDateString()}.`
                          : "Your account is being activated."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : isAwaiting ? (
                <div className="px-8 pb-8">
                  <div className="bg-amber-50 rounded-lg p-4 flex items-start gap-3">
                    <Loader2 className="h-5 w-5 text-amber-600 animate-spin shrink-0 mt-0.5" />
                    <div>
                      <p className="text-gray-900 font-medium">Payment submitted</p>
                      <p className="text-sm text-gray-600 mt-1">
                        We received your MoMo transaction. A platform operator will verify it and activate
                        your account shortly.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* MoMo Payment */}
                  <div className="px-8 pb-6">
                    <div className="rounded-lg p-6 space-y-4" style={{ backgroundColor: "#F7F9FB", border: "1px solid rgba(11, 28, 45, 0.12)", borderLeft: "4px solid #C7A14A" }}>
                      <div className="text-sm font-semibold" style={{ color: "#0B1C2D" }}>
                        Pay via MTN MoMo
                      </div>
                      <div className="text-sm">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Payee </span>
                        <span className="font-mono font-semibold text-gray-900">{state.info.momo.payee_number}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Send the amount above to the payee number, then MTN MoMo sends you an SMS with a{" "}
                        <span className="font-semibold text-gray-700">Transaction ID</span>. Enter that ID below to
                        confirm your payment.
                      </p>
                    </div>
                  </div>

                  {/* Confirm Form */}
                  <div className="px-8 pb-6">
                    <form onSubmit={handleConfirm} className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="tx" className="text-sm font-medium text-gray-700 block">
                          Transaction ID (from your MoMo SMS)
                        </label>
                        <Input
                          id="tx"
                          type="text"
                          placeholder="e.g. the ID from your MoMo SMS"
                          value={txId}
                          onChange={(e) => {
                            setTxId(e.target.value);
                            setSubmitError("");
                          }}
                          className="h-12"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="phone" className="text-sm font-medium text-gray-700 block">
                          Payer phone (optional)
                        </label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="25078XXXXXXX"
                          value={payerPhone}
                          onChange={(e) => setPayerPhone(e.target.value)}
                          className="h-12"
                        />
                      </div>

                      {submitError && (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                          <XCircle className="h-4 w-4 shrink-0" />
                          {submitError}
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={submitting}
                        className="w-full h-12 text-white font-medium rounded-lg"
                        style={{ backgroundColor: "#0a1929" }}
                      >
                        {submitting ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Submitting…
                          </span>
                        ) : (
                          "I've paid — confirm my payment"
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 text-center">
                        Your payment is verified manually before your account is activated.
                      </p>
                    </form>
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-sm font-semibold" style={{ color: "#0B1C2D" }}>INDATAFLOW LTD</p>
          <p className="text-sm text-gray-500">KG 123 St, Kigali, Rwanda</p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <a href="mailto:support@indataflow.com" style={{ color: "#0a1929" }}>
              support@indataflow.com
            </a>
            <span>•</span>
            <a href="tel:+250788123456" style={{ color: "#0a1929" }}>
              +250 788 123 456
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}