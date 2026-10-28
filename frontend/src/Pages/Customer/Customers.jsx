import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddCustomer from "./AddCustomer";
import ViewCustomer from "./ViewCustomer";
import SetCustomerPassword from "./SetCustomerPassword";
import DeleteConfirmation from "../../components/DeleteConfirmation";
import { isAdminRole } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { createColumnHelper } from "@tanstack/react-table";
import { DataTable } from "../../Layout/DataTable";
import {
  IconDotsVertical,
  IconArrowsSort,
  IconUserPlus,
  IconKey,
  IconTrash,
  IconEye,
  IconAlertTriangle,
  IconLock,
  IconUser,
  IconBriefcase,
  IconBuildingStore,
  IconSparkles,
} from "@tabler/icons-react";
import { SectionCards } from "../../Layout/StatsCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { apiRequest, getApiBase, toastApiEmpty } from "@/lib/api";
import { toastUndoableDelete } from "@/lib/toastActions";

const columnHelper = createColumnHelper();

const Customers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState(null);
  const [passwordCustomer, setPasswordCustomer] = useState(null);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [bulkDeleteRows, setBulkDeleteRows] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const [activeTypeTab, setActiveTypeTab] = useState("All");
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadCustomers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiRequest("/admin/customers", { label: "Customers" });
      if (!res.ok) {
        setCustomers([]);
        setLoadError(res.reason);
        return;
      }
      const data = res.data || {};
      const rawList =
        data.customers ||
        data.data?.customers ||
        data.data?.clients ||
        (Array.isArray(data.data) ? data.data : null) ||
        (Array.isArray(data) ? data : []);
      if (Array.isArray(rawList)) {
        const mapped = rawList.map((c) => {
          let type = "Individual";
          if (Number(c.is_b2b) === 1 || String(c.client_type || "").toUpperCase() === "B2B") {
            type = "B2B";
          } else if (String(c.client_type || "").toLowerCase() === "business") {
            type = "Business";
          }
          const created = c.created_at ? new Date(String(c.created_at).replace(" ", "T")) : null;
          const validDate = created && !Number.isNaN(created.getTime());
          const ageDays = validDate ? (Date.now() - created.getTime()) / 86400000 : null;
          return {
            id: c.id,
            name: c.full_name || "Customer",
            email: c.email || "",
            type: type,
            signedUp: validDate
              ? created.toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Recent",
            ageDays,
            isNew: ageDays !== null && ageDays <= 7,
            access:
              type === "B2B" || type === "Business"
                ? c.portal_login_ready === false
                  ? "Needs portal password"
                  : "Portal login"
                : "Website account",
            source: c.wordpress_user_id ? "Website signup" : "CRM",
            companies: c.companies_count ?? 0,
            orders: c.orders_count ?? 0,
            status: c.status || "Active",
            raw: c,
          };
        });
        setCustomers(mapped);
        if (mapped.length === 0) toastApiEmpty("Customers", getApiBase());
      } else {
        setCustomers([]);
        setLoadError("API returned an unexpected response shape (no customers list).");
        toast.error("Customers failed to load", {
          description: "API returned an unexpected response shape (no customers list).",
          duration: 8000,
        });
      }
    } catch (err) {
      console.error("Failed to load customers from backend", err);
      setCustomers([]);
      setLoadError(err?.message || "Unexpected error");
      toast.error("Customers failed to load", {
        description: err?.message || "Unexpected error",
        duration: 8000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Headline numbers; the type cards switch the tab below
  const customerStats = useMemo(() => {
    const count = (type) => customers.filter((c) => c.type === type).length;
    const tab = (value) => ({
      onClick: () => setActiveTypeTab(value),
      active: activeTypeTab === value,
    });
    return [
      {
        title: "Total Customers",
        hero: true,
        value: String(customers.length),
        footerSubText: `${customers.filter((c) => c.orders > 0).length} have ordered`,
        ...tab("All"),
      },
      {
        title: "Individual",
        tone: "violet",
        icon: IconUser,
        value: String(count("Individual")),
        footerSubText: "Website accounts",
        ...tab("Individual"),
      },
      {
        title: "Business",
        tone: "orange",
        icon: IconBriefcase,
        value: String(count("Business")),
        footerSubText: "Website accounts",
        ...tab("Business"),
      },
      {
        title: "B2B Partners",
        tone: "emerald",
        icon: IconBuildingStore,
        value: String(count("B2B")),
        footerSubText: `${customers.filter((c) => c.access === "Needs portal password").length} need a portal password`,
        ...tab("B2B"),
      },
      {
        title: "New This Week",
        tone: "rose",
        icon: IconSparkles,
        value: String(customers.filter((c) => c.isNew).length),
        footerSubText: "Signed up in the last 7 days",
      },
    ];
  }, [customers, activeTypeTab]);

  // Handler: Single Customer Delete (optimistic + Undo)
  const confirmSingleDelete = () => {
    if (!customerToDelete?.id) return;
    const victim = customerToDelete;
    const snapshot = customers;
    setCustomerToDelete(null);
    setIsDeleting(false);
    setCustomers((prev) => prev.filter((c) => c.id !== victim.id));

    toastUndoableDelete({
      message: `Customer "${victim.name}" deleted`,
      description: victim.email || "Undo available for a few seconds",
      onUndo: () => setCustomers(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || "/api";
        const token = localStorage.getItem("token");
        const res = await fetch(`${apiUrl}/admin/customers/delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            customer_id: victim.id,
            force_delete_genuine: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!(res.ok && (data.status === "success" || data.success === true))) {
          throw new Error(data.message || data.error || "Failed to delete customer.");
        }
      },
    });
  };

  // Handler: Bulk Customer Delete (optimistic + Undo)
  const confirmBulkDelete = () => {
    if (!bulkDeleteRows || bulkDeleteRows.length === 0) return;
    const rows = bulkDeleteRows;
    const customerIds = rows.map((r) => r.original.id).filter(Boolean);
    if (customerIds.length === 0) return;
    const idSet = new Set(customerIds);
    const snapshot = customers;
    setBulkDeleteRows(null);
    setIsDeleting(false);
    setCustomers((prev) => prev.filter((c) => !idSet.has(c.id)));

    toastUndoableDelete({
      message: `${customerIds.length} customer(s) deleted`,
      description: "Undo available for a few seconds",
      onUndo: () => setCustomers(snapshot),
      onCommit: async () => {
        const apiUrl = import.meta.env.VITE_API_URL || "/api";
        const token = localStorage.getItem("token");
        const res = await fetch(`${apiUrl}/admin/customers/bulk-delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            customer_ids: customerIds,
            force_delete_genuine: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!(res.ok && (data.status === "success" || data.success === true))) {
          throw new Error(data.message || data.error || "Failed to bulk delete customers.");
        }
      },
    });
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      columnHelper.accessor("name", {
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              className="p-0 hover:bg-transparent font-semibold"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Customer Name
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const customer = row.original;
          return (
            <button
              type="button"
              className="text-left font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
              onClick={() => setViewCustomer(customer)}
            >
              {customer.name}
              {customer.isNew && (
                <Badge className="badge-sky ml-2 text-[10px] h-4 px-1.5">New</Badge>
              )}
            </button>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              className="p-0 hover:bg-transparent font-semibold"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              Email
              <IconArrowsSort className="ml-2 h-4 w-4" />
            </Button>
          );
        },
      }),
      columnHelper.accessor("type", {
        header: "Type",
        cell: ({ row }) => {
          const customer = row.original;
          const type = customer.type || "Individual";
          const isLocked =
            Number(customer.raw?.type_locked ?? customer.raw?.type_change_count ?? 0) >= 1;

          // Read-only here: the type is changed from the customer profile (admin only).
          return (
            <div
              className="flex items-center gap-1.5"
              title={isLocked ? "Type is locked (1-time change used)" : undefined}
            >
              <Badge
                variant={type === "B2B" ? "default" : type === "Business" ? "outline" : "secondary"}
                className="text-[11px] h-6 font-medium"
              >
                {type}
              </Badge>
              {isLocked && <IconLock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />}
            </div>
          );
        },
      }),
      columnHelper.accessor("signedUp", {
        header: "Signed up",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.getValue("signedUp")}</span>
        ),
      }),
      columnHelper.accessor("source", {
        header: "Source",
        cell: ({ row }) => {
          const source = row.getValue("source");
          if (source === "Website signup") {
            return <Badge className="badge-sky">Website signup</Badge>;
          }
          return <Badge className="badge-green">{source || "CRM"}</Badge>;
        },
      }),
      columnHelper.accessor("companies", {
        header: "Companies",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-muted text-muted-foreground">
            {row.getValue("companies")}
          </span>
        ),
      }),
      columnHelper.accessor("orders", {
        header: "Orders",
        cell: ({ row }) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-muted text-muted-foreground">
            {row.getValue("orders")}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status");
          if (status === "Active") {
            return <Badge className="badge-green">Active</Badge>;
          }
          if (status === "Pending") {
            return <Badge className="badge-amber">Pending</Badge>;
          }
          return <Badge className="badge-red">{status || "Inactive"}</Badge>;
        },
      }),
      columnHelper.accessor("access", {
        header: "Access",
        cell: ({ row }) => {
          const access = row.getValue("access");
          return (
            <Badge className={access === "Needs portal password" ? "badge-amber" : "badge-green"}>
              {access}
            </Badge>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => {
          const customer = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-7 w-7 p-0">
                  <span className="sr-only">Open menu</span>
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setViewCustomer(customer)}>
                    {customer.type === "B2B" ? "Open B2B" : "View Customer"}
                  </DropdownMenuItem>
                  {customer.type === "B2B" && (
                    <DropdownMenuItem onClick={() => navigate(`/admin/orders?b2b=${customer.id}`)}>
                      Orders
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setPasswordCustomer(customer)}>
                    Set Password
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {isAdminRole() && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setCustomerToDelete(customer)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [navigate],
  );

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (activeTypeTab !== "All" && (c.type || "").toLowerCase() !== activeTypeTab.toLowerCase())
        return false;
      return true;
    });
  }, [customers, activeTypeTab]);

  const customerFilterConfig = [
    {
      columnKey: "source",
      placeholder: "Sources",
      options: [
        { label: "Website signup", value: "Website signup" },
        { label: "Created in CRM", value: "CRM" },
      ],
    },
    {
      columnKey: "status",
      placeholder: "Status",
      options: [
        { label: "Active", value: "Active" },
        { label: "Pending", value: "Pending" },
        { label: "Suspended", value: "Suspended" },
      ],
    },
    {
      columnKey: "access",
      placeholder: "Access",
      options: [
        { label: "Website account", value: "Website account" },
        { label: "Portal login", value: "Portal login" },
        { label: "Needs portal password", value: "Needs portal password" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers & Signups</h2>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <IconUserPlus className="mr-2 h-4 w-4" />
          Create Customer
        </Button>
      </div>

      <SectionCards stats={customerStats} isLoading={isLoading} compact />

      <Tabs value={activeTypeTab} onValueChange={setActiveTypeTab} className="w-full">
        <TabsList>
          <TabsTrigger
            value="All"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="Individual"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Individual
          </TabsTrigger>
          <TabsTrigger
            value="Business"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Business
          </TabsTrigger>
          <TabsTrigger
            value="B2B"
            className="text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            B2B
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={filteredCustomers}
        filterConfig={customerFilterConfig}
        isLoading={isLoading}
        onDeleteSelected={isAdminRole() ? (rows) => setBulkDeleteRows(rows) : undefined}
      />

      {/* Create Customer Modal */}
      <AddCustomer
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCustomerCreated={() => loadCustomers()}
      />

      {/* View Customer Details Modal */}
      {viewCustomer && (
        <ViewCustomer
          customer={viewCustomer}
          isOpen={!!viewCustomer}
          onClose={() => setViewCustomer(null)}
          onCustomerUpdated={() => loadCustomers()}
        />
      )}

      {/* Set/Reset Password Modal */}
      {passwordCustomer && (
        <SetCustomerPassword
          customer={passwordCustomer}
          isOpen={!!passwordCustomer}
          onClose={() => setPasswordCustomer(null)}
          onPasswordSet={() => loadCustomers()}
        />
      )}

      {/* Single Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={confirmSingleDelete}
        title="Delete Customer"
        description="This will permanently delete this client and all associated access."
        confirmText="Delete"
        isLoading={isDeleting}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <DeleteConfirmation
        isOpen={!!bulkDeleteRows}
        onClose={() => setBulkDeleteRows(null)}
        onConfirm={confirmBulkDelete}
        title="Delete Selected Customers"
        description="This will permanently delete all selected client accounts and associated access."
        confirmText={`Delete (${bulkDeleteRows?.length || 0})`}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default Customers;
