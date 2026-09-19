import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shop.server";
import { listStaff, createStaff, setStaffActive } from "../services/staff.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const staff = await listStaff(shop.id, true);
  return {
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "create") {
      await createStaff({
        shopId: shop.id,
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? "") || null,
      });
      return { ok: true, message: "Staff member added" };
    }
    if (intent === "setActive") {
      await setStaffActive(
        shop.id,
        String(formData.get("staffId")),
        String(formData.get("active")) === "true",
      );
      return { ok: true, message: "Staff updated" };
    }
    return { ok: false, message: `Unknown intent: ${intent}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Something went wrong" };
  }
};

const ADD_STAFF_MODAL = "add-staff-modal";

export default function TeamPage() {
  const { staff } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const submit = () => {
    fetcher.submit({ intent: "create", name: name.trim(), email: email.trim() }, { method: "post" });
    setName("");
    setEmail("");
  };

  return (
    <s-page heading="Team">
      <s-button slot="primary-action" variant="primary" commandFor={ADD_STAFF_MODAL} command="--show">
        Add staff member
      </s-button>

      {fetcher.data?.message ? (
        <s-banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</s-banner>
      ) : null}

      <s-section padding="none">
        {staff.length === 0 ? (
          <s-box padding="large-100">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>No team members yet</s-heading>
              <s-paragraph color="subdued">Add staff so orders can be assigned for processing.</s-paragraph>
              <s-button variant="primary" commandFor={ADD_STAFF_MODAL} command="--show">
                Add staff member
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Name</s-table-header>
              <s-table-header>Email</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {staff.map((member) => (
                <s-table-row key={member.id}>
                  <s-table-cell>
                    <s-text type="strong">{member.name}</s-text>
                  </s-table-cell>
                  <s-table-cell>{member.email ?? "-"}</s-table-cell>
                  <s-table-cell>
                    {member.active ? (
                      <s-badge tone="success">Active</s-badge>
                    ) : (
                      <s-badge tone="neutral">Inactive</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="secondary"
                      onClick={() =>
                        fetcher.submit(
                          { intent: "setActive", staffId: member.id, active: String(!member.active) },
                          { method: "post" },
                        )
                      }
                    >
                      {member.active ? "Deactivate" : "Reactivate"}
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-modal id={ADD_STAFF_MODAL} heading="Add staff member">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <s-email-field
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          disabled={!name.trim()}
          commandFor={ADD_STAFF_MODAL}
          command="--hide"
          onClick={submit}
        >
          Add
        </s-button>
        <s-button slot="secondary-actions" commandFor={ADD_STAFF_MODAL} command="--hide">
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
