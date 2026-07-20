import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Church, Mail, ShieldCheck } from "lucide-react";
import { SoftwareCopyright } from "@/components/SoftwareCopyright";
import { privacyContactEmail } from "@/lib/privacy";

export const metadata: Metadata = {
  title: "Termos de Uso | IASD Calçada",
  description: "Regras para utilização do sistema de presença da IASD Calçada."
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-card border border-line bg-white p-5 shadow-soft sm:p-8">
        <div className="mb-7 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-wine text-white">
            <BookOpenCheck aria-hidden="true" size={25} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-wine">IASD Calçada</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Termos de Uso</h1>
            <p className="mt-2 text-sm text-muted">Última atualização: 19 de julho de 2026.</p>
          </div>
        </div>

        <div className="space-y-7 text-sm leading-7 text-muted sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-ink">1. Aceitação e finalidade</h2>
            <p className="mt-2">
              Estes Termos regulam o acesso ao sistema de cadastro, presença e acompanhamento da
              IASD Calçada. Ao entrar, o usuário confirma que conhece estas regras e utilizará o
              sistema somente para as atividades autorizadas da igreja.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">2. Usuários autorizados</h2>
            <p className="mt-2">
              O acesso é permitido apenas a pessoas previamente cadastradas e aprovadas pelo
              administrador, conforme o perfil de Recepção ou Liderança. A liberação de uma conta
              não autoriza o usuário a acessar funções fora de suas atribuições.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">3. Login, senha e equipamentos</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>login e senha são pessoais e não devem ser compartilhados;</li>
              <li>o usuário deve utilizar senha segura e manter seus dispositivos protegidos;</li>
              <li>ao terminar o trabalho, deve sair do sistema, especialmente em equipamentos compartilhados;</li>
              <li>suspeitas de acesso indevido devem ser comunicadas imediatamente ao administrador.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">4. Uso adequado</h2>
            <p className="mt-2">O usuário compromete-se a:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>registrar informações verdadeiras, pertinentes e necessárias;</li>
              <li>consultar dados somente quando houver necessidade relacionada à sua função;</li>
              <li>tratar pedidos de oração e acompanhamentos pastorais com confidencialidade;</li>
              <li>corrigir prontamente informações inseridas incorretamente;</li>
              <li>respeitar o Aviso de Privacidade e as orientações da administração.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">5. Condutas proibidas</h2>
            <p className="mt-2">Não é permitido:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>usar dados para interesses particulares, publicidade ou finalidade estranha à igreja;</li>
              <li>compartilhar cadastros, relatórios, pedidos de oração ou exportações com pessoas não autorizadas;</li>
              <li>tentar contornar permissões, acessar contas de terceiros ou comprometer a segurança;</li>
              <li>copiar, modificar, comercializar ou disponibilizar o software sem autorização de sua titular.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">6. Proteção de dados e auditoria</h2>
            <p className="mt-2">
              O tratamento de dados pessoais segue o Aviso de Privacidade. Para proteção e prestação
              de contas, o sistema pode registrar acessos, exportações, acompanhamentos e outras ações
              realizadas pelos usuários autorizados. Esses registros são acessíveis conforme as
              permissões administrativas do sistema.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">7. Titularidade e autorização de uso</h2>
            <p className="mt-2">
              O software pertence a Paulo Victor Silva de Oliveira LTDA, CNPJ 57.152.299/0001-17.
              A IASD Calçada recebe autorização de uso para suas atividades internas. Essa autorização
              não transfere o código-fonte, a titularidade ou o direito de sublicenciar o sistema.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">8. Disponibilidade e suporte</h2>
            <p className="mt-2">
              O funcionamento depende de serviços de internet e de fornecedores de infraestrutura.
              Poderão ocorrer manutenções, atualizações ou indisponibilidades temporárias. Problemas
              devem ser comunicados para análise e correção, sem prejuízo das responsabilidades que
              não possam ser afastadas pela legislação aplicável.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">9. Suspensão de acesso</h2>
            <p className="mt-2">
              O administrador poderá suspender ou revogar contas por mudança de função, desligamento,
              inatividade, risco à segurança ou descumprimento destes Termos. A suspensão não autoriza
              a eliminação indevida de registros que devam ser conservados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">10. Alterações e contato</h2>
            <p className="mt-2">
              Estes Termos poderão ser atualizados para refletir mudanças legais, operacionais ou de
              segurança. A data da versão vigente estará indicada no início da página.
            </p>
            {privacyContactEmail ? (
              <a className="secondary-button mt-4 justify-start" href={`mailto:${privacyContactEmail}`}>
                <Mail aria-hidden="true" size={17} /> {privacyContactEmail}
              </a>
            ) : null}
          </section>

          <section className="rounded-card border border-forest/20 bg-forest/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-forest" size={20} />
              <p>
                Consulte também o <Link className="font-semibold text-forest underline" href="/privacidade">Aviso de Privacidade</Link>,
                que explica como os dados pessoais são tratados e como exercer seus direitos.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
          <Link className="secondary-button" href="/login">
            <ArrowLeft aria-hidden="true" size={17} /> Voltar ao login
          </Link>
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Church aria-hidden="true" size={17} /> IASD Calçada
          </span>
        </div>
        <SoftwareCopyright className="mt-5 border-t border-line pt-5" />
      </article>
    </main>
  );
}
