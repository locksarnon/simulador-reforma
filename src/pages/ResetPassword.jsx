import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get("token");
  const convite = searchParams.get("convite") === "1";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 10) {
      setError("A senha precisa ter pelo menos 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      await api.auth.resetPassword({ resetToken, newPassword });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Não foi possível salvar a senha.");
    } finally {
      setLoading(false);
    }
  };

  if (!resetToken) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Link inválido"
        subtitle="Este link de redefinição de senha não existe ou já venceu"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Pedir um link novo
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          O link parece incompleto. Peça um link novo ao administrador do InTAX ou use Esqueci minha senha na tela de entrada.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={convite ? "Crie sua senha" : "Nova senha"}
      subtitle={convite ? "Bem-vindo ao InTAX. Crie a senha que você vai usar para entrar." : "Digite a nova senha abaixo"}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{convite ? "Senha" : "Nova senha"} <span className="font-normal text-muted-foreground">(mínimo 10 caracteres)</span></Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirme a senha</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando…
            </>
          ) : (
            convite ? "Criar senha e entrar" : "Redefinir a senha"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
