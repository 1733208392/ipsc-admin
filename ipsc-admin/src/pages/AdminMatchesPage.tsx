import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { Match } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function AdminMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  async function load() {
    setLoading(true)
    try {
      const data = await api.get<Match[]>('/admin/matches')
      setMatches(data)
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">全平台赛事</h1>
      <Card>
        <CardHeader>
          <CardTitle>赛事列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">加载中...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>赛事名称</TableHead>
                  <TableHead>俱乐部</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>组别</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Squad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.id}</TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{m.club_name ?? '-'}</TableCell>
                    <TableCell>{m.date}</TableCell>
                    <TableCell>{m.status}</TableCell>
                    <TableCell>{m.divisions_count ?? 0}</TableCell>
                    <TableCell>{m.stages_count ?? 0}</TableCell>
                    <TableCell>{m.squads_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
