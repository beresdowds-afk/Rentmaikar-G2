import { useState } from 'react';
import { useFAQ, FAQCategory, FAQItem } from '@/hooks/useFAQ';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  HelpCircle,
  Loader2,
  Eye,
  EyeOff,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';

export function FAQManagement() {
  const { categories, items, loading, createCategory, updateCategory, deleteCategory, createItem, updateItem, deleteItem } = useFAQ();
  
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FAQCategory | null>(null);
  const [editingItem, setEditingItem] = useState<FAQItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: '',
    description: '',
    display_order: 0,
    is_active: true,
    region: 'all' as 'USA' | 'Nigeria' | (string & {}) | 'all',
  });

  // Item form state
  const [itemForm, setItemForm] = useState({
    category_id: '',
    question: '',
    answer: '',
    display_order: 0,
    is_active: true,
    is_public: true,
    region: 'all' as 'USA' | 'Nigeria' | (string & {}) | 'all',
  });

  const openCategoryDialog = (category?: FAQCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        display_order: category.display_order,
        is_active: category.is_active,
        region: category.region,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        slug: '',
        description: '',
        display_order: categories.length + 1,
        is_active: true,
        region: 'all',
      });
    }
    setCategoryDialogOpen(true);
  };

  const openItemDialog = (item?: FAQItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        category_id: item.category_id,
        question: item.question,
        answer: item.answer,
        display_order: item.display_order,
        is_active: item.is_active,
        is_public: item.is_public,
        region: item.region,
      });
    } else {
      setEditingItem(null);
      setItemForm({
        category_id: categories[0]?.id || '',
        question: '',
        answer: '',
        display_order: items.length + 1,
        is_active: true,
        is_public: true,
        region: 'all',
      });
    }
    setItemDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name || !categoryForm.slug) {
      toast.error('Name and slug are required');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryForm);
      } else {
        await createCategory(categoryForm);
      }
      setCategoryDialogOpen(false);
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveItem = async () => {
    if (!itemForm.category_id || !itemForm.question || !itemForm.answer) {
      toast.error('Category, question, and answer are required');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateItem(editingItem.id, itemForm);
      } else {
        await createItem(itemForm);
      }
      setItemDialogOpen(false);
    } catch (error) {
      console.error('Error saving item:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure? This will delete all FAQ items in this category.')) return;
    await deleteCategory(id);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this FAQ item?')) return;
    await deleteItem(id);
  };

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            FAQ Items ({items.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Categories ({categories.length})
          </TabsTrigger>
        </TabsList>

        {/* FAQ Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>FAQ Items</CardTitle>
                <CardDescription>Manage frequently asked questions</CardDescription>
              </div>
              <Button onClick={() => openItemDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add FAQ
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-md truncate">{item.question}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getCategoryName(item.category_id)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Globe className="h-3 w-3" />
                          {item.region}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.is_active ? (
                          <Badge className="bg-primary text-primary-foreground">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.is_public ? (
                          <Eye className="h-4 w-4 text-primary" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openItemDialog(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>FAQ Categories</CardTitle>
                <CardDescription>Organize FAQ items into categories</CardDescription>
              </div>
              <Button onClick={() => openCategoryDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>{category.display_order}</TableCell>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{category.region}</Badge>
                      </TableCell>
                      <TableCell>
                        {category.is_active ? (
                          <Badge className="bg-primary text-primary-foreground">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {items.filter(i => i.category_id === category.id).length}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openCategoryDialog(category)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(category.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update the category details' : 'Create a new FAQ category'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Payments & Finance"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={categoryForm.slug}
                onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                placeholder="e.g., payments"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Brief description of this category"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={categoryForm.region}
                  onValueChange={(value) => setCategoryForm({ ...categoryForm, region: value as 'USA' | 'Nigeria' | (string & {}) | 'all' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="USA">USA Only</SelectItem>
                    <SelectItem value="Nigeria">Nigeria Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={categoryForm.is_active}
                onCheckedChange={(checked) => setCategoryForm({ ...categoryForm, is_active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit FAQ Item' : 'Add FAQ Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update the FAQ item' : 'Create a new frequently asked question'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={itemForm.category_id}
                onValueChange={(value) => setItemForm({ ...itemForm, category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Question</Label>
              <Input
                value={itemForm.question}
                onChange={(e) => setItemForm({ ...itemForm, question: e.target.value })}
                placeholder="e.g., How do I make payments?"
              />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea
                value={itemForm.answer}
                onChange={(e) => setItemForm({ ...itemForm, answer: e.target.value })}
                placeholder="Provide a detailed answer..."
                rows={5}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={itemForm.display_order}
                  onChange={(e) => setItemForm({ ...itemForm, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Select
                  value={itemForm.region}
                  onValueChange={(value) => setItemForm({ ...itemForm, region: value as 'USA' | 'Nigeria' | (string & {}) | 'all' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="USA">USA Only</SelectItem>
                    <SelectItem value="Nigeria">Nigeria Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={itemForm.is_active}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, is_active: checked })}
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={itemForm.is_public}
                  onCheckedChange={(checked) => setItemForm({ ...itemForm, is_public: checked })}
                />
                <Label>Public (visible to non-logged-in users)</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveItem} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
