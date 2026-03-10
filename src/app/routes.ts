import { createBrowserRouter } from "react-router";
import PaymentPage from "./components/payment-page";

export const router = createBrowserRouter([
  {
    path: "/:tenant/pay/:paymentIntentId",
    Component: PaymentPage,
  },
  {
    path: "*",
    Component: () => {
      window.location.href = "/demo-tenant/pay/demo-payment";
      return null;
    },
  },
]);
