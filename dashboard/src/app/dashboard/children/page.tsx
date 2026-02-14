"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getParentInfo, getMutationClient } from "@/lib/supabase/helpers";

type Child = {
  id: string;
  name: string;
  age: number | null;
  tier: "kid_10" | "tween_13" | "teen_16";
  created_at: string;
};

const TIER_LABELS: Record<string, string> = {
  kid_10: "Young Child (10-)",
  tween_13: "Tween (11-13)",
  teen_16: "Teen (14-16)",
};

export default function ChildrenPage() {
  const supabase = createClient();
  const [children, setChildren] = useState<Child[]>([]);
  const [familyId, setFamilyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<string>("tween_13");

  useEffect(() => {
    loadChildren();
  }, []);

  async function loadChildren() {
    const parent = await getParentInfo(supabase);
    if (!parent) return;
    setFamilyId(parent.family_id);

    const { data } = await supabase
      .from("children")
      .select("*")
      .eq("family_id", parent.family_id)
      .order("created_at");

    setChildren((data as Child[]) ?? []);
    setLoading(false);
  }

  async function addChild() {
    if (!newName.trim() || !familyId) return;

    const db = getMutationClient(supabase);
    await db.from("children").insert({
      family_id: familyId,
      name: newName.trim(),
      tier: newTier,
    });

    setNewName("");
    setShowAdd(false);
    loadChildren();
  }

  async function removeChild(id: string) {
    await getMutationClient(supabase).from("children").delete().eq("id", id);
    loadChildren();
  }

  if (loading) {
    return <div className="text-white/30 text-sm">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Children</h1>
          <p className="text-white/40 text-sm mt-1">Manage child profiles and protection tiers</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl hover:bg-[#7C5CFF]/90 transition"
        >
          + Add Child
        </button>
      </div>

      {showAdd && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Child's name"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50"
            />
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#7C5CFF]/50"
            >
              <option value="kid_10">Young Child</option>
              <option value="tween_13">Tween</option>
              <option value="teen_16">Teen</option>
            </select>
            <button onClick={addChild} className="px-5 py-2.5 bg-[#7C5CFF] text-white text-sm font-medium rounded-xl">
              Add
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {children.map((child) => (
          <div key={child.id} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-6 py-5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C5CFF]/30 to-[#22D3EE]/30 flex items-center justify-center text-sm font-bold text-white/70">
              {child.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{child.name}</p>
              <p className="text-white/30 text-xs">{TIER_LABELS[child.tier]}</p>
            </div>
            <button
              onClick={() => removeChild(child.id)}
              className="text-white/20 hover:text-red-400 text-xs transition"
            >
              Remove
            </button>
          </div>
        ))}
        {children.length === 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No children added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
