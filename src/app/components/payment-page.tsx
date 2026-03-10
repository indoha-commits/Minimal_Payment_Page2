import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";

type PaymentStatus = "idle" | "pending" | "success" | "failed";

export default function PaymentPage() {
  const invoiceId = new URLSearchParams(window.location.search).get("invoice_id") || "";
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const apiBase = (import.meta.env.VITE_PAYMENT_API_BASE_URL as string | undefined) || "";
  const internalBase = (import.meta.env.VITE_INTERNAL_DASHBOARD_BASE_URL as string | undefined) || "";
  const [error, setError] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualStatus, setManualStatus] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [manualError, setManualError] = useState("");

  const [invoiceData, setInvoiceData] = useState<{
    invoiceNumber: string;
    setupFee: number;
    vatRate: number;
    currency: string;
    tenantName: string;
    tenantSubdomain?: string;
  } | null>(null);

  const vatAmount = invoiceData ? invoiceData.setupFee * invoiceData.vatRate : 0;
  const totalAmount = invoiceData ? invoiceData.setupFee + vatAmount : 0;

  const validatePhoneNumber = (phone: string): boolean => {
    // Rwanda MSISDN format: 25078XXXXXXX or 25079XXXXXXX
    const regex = /^2507[8-9]\d{7}$/;
    return regex.test(phone);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ""); // Remove non-digits
    setPhoneNumber(value);
    setError("");
  };

  const handleManualFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setManualFile(file);
    setManualError("");
  };

  const handleManualSubmit = async () => {
    if (!manualFile || !invoiceId) {
      setManualError("Please upload proof of payment");
      return;
    }

    try {
      setManualError("");
      setManualStatus("pending");

      const form = new FormData();
      form.append("invoice_id", invoiceId);
      if (manualRef) form.append("reference", manualRef);
      form.append("file", manualFile);

      const res = await fetch(`${apiBase}/payments/manual/proof`, {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Upload failed");

      setManualStatus("success");
    } catch (err: any) {
      setManualStatus("failed");
      setManualError(String(err?.message ?? err));
    }
  };

  const handleSendPayment = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      setError("Invalid phone number");
      return;
    }

    try {
      setError("");
      setStatus("pending");

      if (!apiBase) throw new Error("Missing VITE_PAYMENT_API_BASE_URL");
      if (!invoiceId) throw new Error("Missing invoice id");

      const payRes = await fetch(`${apiBase}/payments/momo/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          phone: phoneNumber,
        }),
      });

      const payJson = await payRes.json().catch(() => ({}));
      if (!payRes.ok) throw new Error(payJson?.error || "Payment request failed");

      const txId = payJson.tx_id as string | undefined;
      const createdPaymentIntentId = payJson.payment_intent_id as string | undefined;
      if (!txId || !createdPaymentIntentId) throw new Error("Missing transaction id");
      setPaymentIntentId(createdPaymentIntentId);

      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        const statusRes = await fetch(`${apiBase}/payments/momo/status?payment_intent_id=${encodeURIComponent(paymentIntentId || '')}`);
        const statusJson = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(statusJson?.error || "Status check failed");

        if (statusJson.status === "SUCCESSFUL") {
          setStatus("success");

          const tenantSlug = (invoiceData?.tenantSubdomain || invoiceData?.tenantName || "").
            toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");

          if (internalBase && tenantSlug) {
            setTimeout(() => {
              window.location.href = `${internalBase.replace(/\/$/, "")}/${tenantSlug}`;
            }, 1500);
          }

          return;
        }
        if (statusJson.status === "FAILED" || statusJson.status === "REJECTED") {
          setStatus("failed");
          setError("Payment failed — try again");
          return;
        }

        if (attempts < 20) {
          setTimeout(poll, 3000);
        } else {
          setStatus("failed");
          setError("Payment still pending. Please check your phone.");
        }
      };

      setTimeout(poll, 3000);
    } catch (err: any) {
      setStatus("failed");
      setError(String(err?.message ?? err));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-RW", {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    const load = async () => {
      if (!apiBase || !invoiceId) return;
      try {
        const res = await fetch(`${apiBase}/payments/invoice?invoice_id=${encodeURIComponent(invoiceId)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "Failed to load invoice");

        const amount = Number(json?.invoice?.amount ?? 0);
        const currency = String(json?.invoice?.currency ?? "RWF");
        const invoiceNumber = String(json?.invoice?.invoice_number ?? "—");
        const tenantName = String(json?.tenant?.company_name ?? "—");
        const tenantSubdomain = String(json?.tenant?.subdomain ?? "");

        setInvoiceData({
          invoiceNumber,
          setupFee: amount,
          vatRate: 0.18,
          currency,
          tenantName,
          tenantSubdomain,
        });
      } catch (err: any) {
        setError(String(err?.message ?? err));
      }
    };

    void load();
  }, [apiBase, invoiceId]);

  const getStatusMessage = () => {
    switch (status) {
      case "pending":
        return (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Check your phone to approve payment</span>
          </div>
        );
      case "success":
        return (
          <div className="flex items-center gap-2 text-[#22C55E]">
            <CheckCircle2 className="h-5 w-5" />
            <span>Payment successful — receipt sent</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[520px]">
        {/* Main Card */}
        <Card className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E3A8A] flex items-center justify-center">
                <span className="text-white text-sm font-bold">ID</span>
              </div>
              <span className="text-gray-900 font-semibold">InDataFlow</span>
            </div>
            <span className="text-sm text-gray-500">Billing</span>
          </div>

          {/* Tenant Info */}
          <div className="px-8 pt-8 pb-6">
            <h1 className="text-2xl font-semibold text-gray-900 capitalize">
              {invoiceData?.tenantName || "Loading..."}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{invoiceData?.invoiceNumber || "—"}</p>
          </div>

          {/* Invoice Summary */}
          <div className="px-8 pb-6">
            <div className="bg-gray-50 rounded-lg p-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Setup Fee (HT)</span>
                <span className="text-gray-900 font-medium">
                  {invoiceData ? `${formatCurrency(invoiceData.setupFee)} ${invoiceData.currency}` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">VAT 18%</span>
                <span className="text-gray-900 font-medium">
                  {invoiceData ? `${formatCurrency(vatAmount)} ${invoiceData.currency}` : "—"}
                </span>
              </div>
              <div className="h-px bg-gray-200 my-2" />
              <div className="flex justify-between items-center">
                <span className="text-gray-900 font-semibold">Total (TTC)</span>
                <span className="text-xl font-bold text-[#1E3A8A]">
                  {invoiceData ? `${formatCurrency(totalAmount)} ${invoiceData.currency}` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="px-8 pb-6 space-y-6">
            <div className="space-y-2">
              <label htmlFor="phone" className="text-sm font-medium text-gray-700 block">
                Phone Number (MTN MoMo)
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="25078XXXXXXX"
                value={phoneNumber}
                onChange={handlePhoneChange}
                maxLength={12}
                className={`h-12 ${error && status === "idle" ? "border-red-500" : ""}`}
                disabled={status === "pending"}
              />
              {error && status === "idle" && (
                <p className="text-sm text-red-600">{error}</p>
              )}
            </div>

            <Button
              onClick={handleSendPayment}
              disabled={status === "pending" || !phoneNumber}
              className="w-full h-12 bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-medium rounded-lg"
            >
              {status === "pending" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Send Payment Prompt"
              )}
            </Button>

            <div className="border-t border-gray-200 pt-4">
              <div className="text-sm font-medium text-gray-700">Or upload proof of payment</div>
              <p className="text-xs text-gray-500 mt-1">
                Pay via bank/visa and upload your receipt. We will confirm and activate your account.
              </p>
              <div className="mt-3 space-y-2">
                <Input
                  type="text"
                  placeholder="Payment reference (optional)"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value)}
                  className="h-10"
                />
                <Input type="file" onChange={handleManualFile} className="h-10" />
                {manualError && manualStatus !== "pending" && (
                  <p className="text-sm text-red-600">{manualError}</p>
                )}
              </div>
              <Button
                onClick={handleManualSubmit}
                disabled={manualStatus === "pending" || !manualFile}
                className="w-full mt-3 h-11 bg-gray-900 hover:bg-gray-900/90 text-white"
              >
                {manualStatus === "pending" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </span>
                ) : manualStatus === "success" ? (
                  "Receipt submitted"
                ) : (
                  "Submit Proof of Payment"
                )}
              </Button>
            </div>
          </div>

          {/* Status Message */}
          {status !== "idle" && (
            <div className="px-8 pb-8">
              <div className="bg-gray-50 rounded-lg p-4 text-sm font-medium">
                {getStatusMessage()}
              </div>
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-sm text-gray-600">
            KG 123 St, Kigali, Rwanda
          </p>
          <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
            <a href="mailto:support@indataflow.com" className="hover:text-[#1E3A8A]">
              support@indataflow.com
            </a>
            <span>•</span>
            <a href="tel:+250788123456" className="hover:text-[#1E3A8A]">
              +250 788 123 456
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
