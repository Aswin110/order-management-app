import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Modal,
  TextField,
  EmptyState,
  Banner,
  BlockStack,
} from "@shopify/polaris";
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

export default function TeamPage() {
  const { staff } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <Page
      title="Team"
      primaryAction={{ content: "Add staff member", onAction: () => setOpen(true) }}
    >
      <Layout>
        {fetcher.data?.message ? (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        ) : null}
        <Layout.Section>
          <Card padding="0">
            {staff.length === 0 ? (
              <EmptyState
                heading="No team members yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{ content: "Add staff member", onAction: () => setOpen(true) }}
              >
                <p>Add staff so orders can be assigned for processing.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "staff member", plural: "staff members" }}
                itemCount={staff.length}
                selectable={false}
                headings={[{ title: "Name" }, { title: "Email" }, { title: "Status" }, { title: "Actions" }]}
              >
                {staff.map((member, index) => (
                  <IndexTable.Row id={member.id} key={member.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{member.name}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{member.email ?? "-"}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {member.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button
                        size="slim"
                        onClick={() =>
                          fetcher.submit(
                            { intent: "setActive", staffId: member.id, active: String(!member.active) },
                            { method: "post" },
                          )
                        }
                      >
                        {member.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add staff member"
        primaryAction={{
          content: "Add",
          disabled: !name.trim(),
          onAction: () => {
            fetcher.submit({ intent: "create", name: name.trim(), email: email.trim() }, { method: "post" });
            setOpen(false);
            setName("");
            setEmail("");
          },
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label="Name" autoComplete="off" value={name} onChange={setName} />
            <TextField label="Email" type="email" autoComplete="off" value={email} onChange={setEmail} />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
