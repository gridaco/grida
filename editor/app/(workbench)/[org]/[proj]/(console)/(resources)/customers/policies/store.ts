import { Platform } from "@/lib/platform";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PolicyState {
  policies: Platform.CustomerAuthPolicy.CustomerAuthPolicy[];
  addPolicy: (policy: Platform.CustomerAuthPolicy.CustomerAuthPolicy) => void;
  updatePolicy: (
    policy: Platform.CustomerAuthPolicy.CustomerAuthPolicy
  ) => void;
  deletePolicy: (id: string) => void;
  getPolicy: (
    id: string
  ) => Platform.CustomerAuthPolicy.CustomerAuthPolicy | undefined;
}

// Initial sample policies
const initialPolicies: Platform.CustomerAuthPolicy.CustomerAuthPolicy[] = [
  {
    id: "1",
    created_at: new Date().toISOString(),
    project_id: 1,
    challenges: [
      {
        type: "passcode",
      },
    ],
    description: "Simple passcode protection for basic access",
    name: "Basic Passcode Protection",
    enabled: true,
    scopes: ["read"],
  },
  {
    id: "2",
    created_at: new Date().toISOString(),
    project_id: 1,
    challenges: [
      {
        type: "kba",
        identifier: "email",
        questions: {
          email: { required: true },
          name: { required: true },
        },
      },
    ],
    description: "Knowledge-based authentication using email and name",
    name: "Customer Identity Verification",
    enabled: true,
    scopes: ["read", "write"],
  },
];

export const usePolicyStore = create<PolicyState>()(
  persist(
    (set, get) => ({
      policies: initialPolicies,

      addPolicy: (policy) => {
        const newPolicy = {
          ...policy,
          id: Math.random().toString(36).substring(2, 9),
          created_at: new Date().toISOString(),
        };
        set((state) => ({
          policies: [...state.policies, newPolicy],
        }));
      },

      updatePolicy: (policy) => {
        set((state) => ({
          policies: state.policies.map((p) =>
            p.id === policy.id ? policy : p
          ),
        }));
      },

      deletePolicy: (id) => {
        set((state) => ({
          policies: state.policies.filter((p) => p.id !== id),
        }));
      },

      getPolicy: (id) => {
        return get().policies.find((p) => p.id === id);
      },
    }),
    {
      name: "auth-policy-storage",
    }
  )
);
