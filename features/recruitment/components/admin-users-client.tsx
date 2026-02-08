"use client"

import { useEffect, useState } from "react"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconPlus, IconUserShield, IconBan, IconTrash, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  role: string | null
  banned: boolean | null
  banReason?: string | null
  banExpires?: Date | null
  createdAt: Date
  updatedAt: Date
}

const ROLES = ["ta", "manager", "hr", "admin"]

// better-auth admin plugin types only accept "admin" | "user" by default,
// but our custom roles (ta, manager, hr, admin) work at runtime.
// This helper casts custom role strings to the expected parameter type.
type BetterAuthRole = "admin" | "user"
function toBetterAuthRole(role: string): BetterAuthRole {
  return role as BetterAuthRole
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "ta",
  })
  const [creating, setCreating] = useState(false)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await authClient.admin.listUsers({
        query: { limit: 100 },
      })
      if (error) {
        toast.error(error.message || "Failed to fetch users")
        return
      }
      if (data) {
        // better-auth's User type doesn't include our custom fields (role, banned, etc.)
        // but the API returns them. We map the response to our User interface.
        const mappedUsers: User[] = data.users.map(u => {
          const extended: Record<string, unknown> = { ...u }
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            emailVerified: u.emailVerified,
            image: u.image,
            role: typeof extended.role === 'string' ? extended.role : null,
            banned: typeof extended.banned === 'boolean' ? extended.banned : null,
            banReason: typeof extended.banReason === 'string' ? extended.banReason : null,
            banExpires: extended.banExpires instanceof Date ? extended.banExpires : null,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }
        })
        setUsers(mappedUsers)
      }
    } catch (err) {
      toast.error("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { error } = await authClient.admin.createUser({
        email: createForm.email,
        password: createForm.password,
        name: createForm.name,
        role: toBetterAuthRole(createForm.role),
      })

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success("User created successfully")
      setIsCreateOpen(false)
      setCreateForm({ name: "", email: "", password: "", role: "ta" })
      fetchUsers()
    } catch (err) {
      toast.error("Failed to create user")
    } finally {
      setCreating(false)
    }
  }

  const handleSetRole = async (userId: string, role: string) => {
    const { error } = await authClient.admin.setRole({
      userId,
      role: toBetterAuthRole(role),
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("Role updated")
    fetchUsers()
  }

  const handleBanUser = async (userId: string) => {
    const { error } = await authClient.admin.banUser({
      userId,
      banReason: "Admin action",
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("User banned")
    fetchUsers()
  }

  const handleUnbanUser = async (userId: string) => {
    const { error } = await authClient.admin.unbanUser({
      userId,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("User unbanned")
    fetchUsers()
  }

  const handleRemoveUser = async (userId: string) => {
    const { error } = await authClient.admin.removeUser({
      userId,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success("User removed")
    fetchUsers()
  }
  
  const getRoleBadgeColor = (role: string | null) => {
      switch(role) {
          case 'ta': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20'
          case 'manager': return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-purple-500/20'
          case 'hr': return 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border-orange-500/20'
          case 'admin': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20'
          default: return ''
      }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage users, roles, and access permissions.
          </CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger render={
            <Button>
              <IconPlus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          } />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the system. They will receive an email to verify their account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  required
                  placeholder="John Doe"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  required
                  type="email"
                  placeholder="john@example.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select
                  value={createForm.role}
                  onValueChange={(value) => setCreateForm({ ...createForm, role: value ?? "ta" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-muted-foreground text-xs">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("capitalize", getRoleBadgeColor((user.role || 'ta') as string))}>
                        {user.role || 'ta'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.banned ? (
                      <Badge variant="destructive" className="gap-1">
                        <IconBan className="h-3 w-3" />
                        Banned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600/20 bg-green-500/10 gap-1 hover:bg-green-500/20">
                        <IconCheck className="h-3 w-3" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Select
                        defaultValue={(user.role || "ta") as string}
                        onValueChange={(val) => handleSetRole(user.id, val ?? "ta")}
                      >
                        <SelectTrigger className="w-[110px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role} className="text-xs">
                              {role.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {user.banned ? (
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => handleUnbanUser(user.id)}
                            title="Unban User"
                        >
                            <IconUserShield className="h-4 w-4 text-green-600" />
                        </Button>
                      ) : (
                        <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => handleBanUser(user.id)}
                            title="Ban User"
                        >
                            <IconBan className="h-4 w-4 text-orange-600" />
                        </Button>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button variant="outline" size="icon-sm" title="Remove User">
                            <IconTrash className="h-4 w-4 text-red-600" />
                          </Button>
                        } />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the user
                              account and remove their data from our servers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleRemoveUser(user.id)}
                            >
                              Delete Account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
