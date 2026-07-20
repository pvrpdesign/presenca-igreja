import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Church, MapPin, ShieldCheck } from "lucide-react";
import { SoftwareCopyright } from "@/components/SoftwareCopyright";
import { PrivacyContactEmail } from "@/components/PrivacyContactEmail";

export const metadata: Metadata = {
  title: "Aviso de Privacidade | IASD Calçada",
  description: "Informações sobre o tratamento de dados pessoais no sistema de presença da IASD Calçada."
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-card border border-line bg-white p-5 shadow-soft sm:p-8">
        <div className="mb-7 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-forest text-white">
            <ShieldCheck aria-hidden="true" size={25} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-forest">IASD Calçada</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Aviso de Privacidade</h1>
            <p className="mt-2 text-sm text-muted">Última atualização: 19 de julho de 2026.</p>
          </div>
        </div>

        <div className="space-y-7 text-sm leading-7 text-muted sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-ink">1. Responsável pelos dados</h2>
            <p className="mt-2">
              A Igreja Adventista do Sétimo Dia – Calçada é responsável pelas decisões sobre o
              tratamento realizado neste sistema de cadastro, presença e acompanhamento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">2. Dados tratados</h2>
            <p className="mt-2">Conforme a finalidade e o relacionamento com a igreja, podemos tratar:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>nome, telefone, bairro ou cidade e informações cadastrais;</li>
              <li>ministério, denominação religiosa, condição de membro ou visitante;</li>
              <li>datas de presença e participação nos cultos;</li>
              <li>pedidos de oração, observações e registros de acompanhamento voluntariamente informados;</li>
              <li>dados de autenticação dos usuários autorizados a operar o sistema.</li>
            </ul>
            <p className="mt-3">
              Denominação, pedidos de oração e outras informações sensíveis são opcionais. Pedimos
              que não sejam fornecidos dados íntimos desnecessários nem informações de terceiros sem
              autorização.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">3. Finalidades</h2>
            <p className="mt-2">Os dados são utilizados para:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>manter os cadastros de membros, visitantes e participantes;</li>
              <li>registrar presença e organizar os cultos;</li>
              <li>realizar acolhimento e acompanhamento pastoral;</li>
              <li>produzir relatórios internos para planejamento das atividades da igreja;</li>
              <li>proteger o sistema, controlar acessos e cumprir obrigações legais.</li>
            </ul>
            <p className="mt-3">
              O tratamento observa as hipóteses aplicáveis da Lei Geral de Proteção de Dados,
              inclusive consentimento específico quando ele for necessário. O fornecimento de dados
              opcionais não é condição para participar do culto.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">4. Acesso e compartilhamento</h2>
            <p className="mt-2">
              O acesso é limitado à recepção e à liderança, conforme suas funções. Informações de
              acompanhamento são reservadas à liderança. Utilizamos Supabase para autenticação e
              banco de dados e Vercel para hospedagem da aplicação. Dados também poderão ser
              compartilhados quando houver obrigação legal ou determinação de autoridade competente.
            </p>
            <p className="mt-3">
              Ao escolher abrir uma mensagem pelo WhatsApp, a pessoa será direcionada para esse
              serviço externo, sujeito aos termos e à política de privacidade do próprio WhatsApp.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">5. Conservação e segurança</h2>
            <p className="mt-2">
              Os dados serão conservados enquanto forem necessários às finalidades informadas e serão
              revisados, eliminados ou anonimizados quando deixarem de ser necessários, ressalvadas as
              hipóteses legais de conservação. O sistema utiliza autenticação, perfis de acesso e
              regras de segurança no banco de dados. Nenhum sistema, entretanto, é totalmente imune a
              incidentes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">6. Seus direitos</h2>
            <p className="mt-2">
              Você pode solicitar confirmação do tratamento, acesso, correção, informação sobre
              compartilhamento, anonimização, bloqueio ou exclusão de dados desnecessários e, quando
              aplicável, revogação do consentimento. Algumas informações poderão ser conservadas nos
              casos permitidos pela legislação.
            </p>
          </section>

          <section className="rounded-card border border-forest/20 bg-forest/5 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-ink">7. Canal de atendimento</h2>
            <p className="mt-2">
              Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, identifique-se e
              informe claramente sua solicitação por um dos canais abaixo:
            </p>
            <div className="mt-4 grid gap-3">
              <PrivacyContactEmail />
              <div className="flex items-start gap-3 rounded-card border border-line bg-white p-3 text-sm text-ink">
                <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-forest" size={18} />
                <span>Atendimento presencial na Secretaria ou recepção da IASD Calçada.</span>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">8. Titularidade do software</h2>
            <p className="mt-2">
              Os direitos relativos ao software pertencem a Paulo Victor Silva de Oliveira LTDA,
              CNPJ 57.152.299/0001-17. Essa identificação não altera a responsabilidade da IASD
              Calçada pelas decisões relacionadas ao tratamento dos dados pessoais neste sistema.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
          <Link className="secondary-button" href="/login">
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar ao login
          </Link>
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <Church aria-hidden="true" size={17} />
            IASD Calçada
          </span>
          <Link className="secondary-button" href="/termos">
            <BookOpenCheck aria-hidden="true" size={17} /> Termos de Uso
          </Link>
        </div>
        <SoftwareCopyright className="mt-5 border-t border-line pt-5" />
      </article>
    </main>
  );
}
