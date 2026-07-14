import React, { useState } from 'react';
import AdminProfilePanel from '../../../components/admin/AdminProfilePanel';
import type { AuthUser, User } from '../../../types';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

type Props = {
  currentUser: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onManagedUsersPatch?: (updater: (prev: User[]) => User[]) => void;
  onNotify: Notify;
};

export default function ProfilePage({
  currentUser,
  onUserUpdated,
  onManagedUsersPatch,
  onNotify,
}: Props) {
  const [saving, setSaving] = useState(false);

  return (
    <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
      <AdminProfilePanel
        currentUser={currentUser}
        saving={saving}
        onSavingChange={setSaving}
        onUpdated={(user) => {
          onUserUpdated(user);
          onManagedUsersPatch?.(prev =>
            prev.map(item =>
              item.id === user.id
                ? {
                    ...item,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    avatar_url: user.avatar_url,
                    bio: user.bio,
                    agent_tier: user.agent_tier,
                    public_slug: user.public_slug,
                    show_public_profile: user.show_public_profile,
                  }
                : item,
            ),
          );
        }}
        onNotify={onNotify}
      />
    </div>
  );
}
