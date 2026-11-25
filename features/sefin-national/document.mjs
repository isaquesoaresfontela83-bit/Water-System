import { X509Certificate } from "node:crypto";

const namespace = "http://www.sped.fazenda.gov.br/nfse";
const signatureNamespace = "http://www.w3.org/2000/09/xmldsig#";
const canonicalization = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const signatureMethod = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const digestMethod = "http://www.w3.org/2001/04/xmlenc#sha256";
const encoder = new TextEncoder();
const rsa = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const dateInBrazil = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });

export class SefinError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export function fiscalDigits(value) {
    return String(value ?? "").replace(/[^0-9]/g, "");
}

function cleanText(value, label, max, min = 0) {
    const text = String(value ?? "").trim().replace(/\s+/gu, " ");
    if (text.length < min || text.length > max || /[^\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(text))
        throw new SefinError(`Confira ${label} (${min} a ${max} caracteres).`);
    return text;
}

function code(value, length, label, required = true) {
    const text = String(value ?? "").trim();
    const digits = fiscalDigits(text);
    if ((!required && !text) || digits.length === length && /^[0-9. -]+$/.test(text)) return digits;
    throw new SefinError(`Informe ${label} com ${length} dígitos.`);
}

function member(value, choices, label) {
    const text = String(value ?? "");
    if (!choices.includes(text)) throw new SefinError(`Selecione ${label}.`);
    return text;
}

function rate(value, label, max, optional = false) {
    const text = String(value ?? "").trim().replace(",", ".");
    if (optional && !text) return "";
    if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(text) || Number(text) > max)
        throw new SefinError(`Informe ${label} de 0 a ${max}%.`);
    return Number(text).toFixed(2);
}

function taxpayer(value, label, companyOnly = false) {
    const doc = fiscalDigits(value);
    const cpf = doc.length === 11;
    if (!(doc.length === 14 || cpf && !companyOnly) || /^(\d)\1+$/.test(doc))
        throw new SefinError(`Confira ${label}.`);
    const numbers = [...doc].map(Number);
    const base = cpf ? 9 : 12;
    const digit = end => {
        const sum = numbers.slice(0, end).reduce((total, current, index) =>
            total + current * (cpf ? end + 1 - index : (end - 1 - index) % 8 + 2), 0);
        const remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    };
    if (digit(base) !== numbers[base] || digit(base + 1) !== numbers[base + 1])
        throw new SefinError(`Confira ${label}.`);
    return doc;
}

export function sefinCompanySettings(input) {
    const regime = member(input.regime, ["2", "3"], "o enquadramento (MEI ou Simples Nacional)");
    const municipalRegistration = cleanText(input.municipalRegistration, "a inscrição municipal", 15);
    const series = Number(input.series);
    if (municipalRegistration && !/^[\dA-Za-z]+$/.test(municipalRegistration))
        throw new SefinError("Informe a inscrição municipal sem pontuação.");
    if (!Number.isInteger(series) || series < 1 || series > 49999)
        throw new SefinError("Informe uma série DPS entre 1 e 49999, reservada para este sistema.");
    return {
        cnpj: taxpayer(input.cnpj, "o CNPJ do prestador", true),
        cityCode: code(input.cityCode, 7, "o código IBGE do município emissor"),
        municipalRegistration,
        serviceCode: code(input.serviceCode, 6, "o código nacional do serviço"),
        municipalServiceCode: code(input.municipalServiceCode, 3, "a especialização municipal do serviço", false),
        nbs: code(input.nbs, 9, "o código NBS", false),
        regime,
        taxAssessment: regime === "3" ? member(input.taxAssessment, ["1", "2", "3"], "o regime de apuração do Simples Nacional") : "",
        totalTaxRate: regime === "3" ? rate(input.totalTaxRate, "o percentual aproximado de tributos", 99.99) : "",
        specialRegime: member(input.specialRegime, ["0", "1", "2", "3", "4", "5", "6", "9"], "o regime especial de tributação"),
        series,
        environment: member(input.environment, ["test", "production"], "o ambiente de emissão"),
    };
}

export function fiscalDate(now = new Date()) {
    return dateInBrazil.format(now);
}

export function sefinDraft(input, settings, now) {
    const issueDate = String(input.issueDate ?? "");
    const date = new Date(issueDate);
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(issueDate) || !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== issueDate || issueDate > fiscalDate(now))
        throw new SefinError("Informe uma data de competência válida, até hoje.");
    const amount = String(input.amount ?? "").trim().replace(",", ".");
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)
        throw new SefinError("Informe o valor do serviço em reais, com até duas casas decimais.");
    const [whole, fractional = ""] = amount.split(".");
    const customerEmail = cleanText(input.customerEmail, "o e-mail do cliente", 80);
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
        throw new SefinError("Informe um e-mail válido para o cliente.");
    const addressFields = ["customerCity", "customerZip", "customerStreet", "customerNumber", "customerDistrict", "customerComplement"];
    const customerAddress = addressFields.some(field => String(input[field] ?? "").trim()) ? {
        city: code(input.customerCity, 7, "o código IBGE do município do cliente"),
        zip: code(input.customerZip, 8, "o CEP do cliente"),
        street: cleanText(input.customerStreet, "o logradouro do cliente", 255, 1),
        number: cleanText(input.customerNumber, "o número do endereço do cliente", 60, 1),
        district: cleanText(input.customerDistrict, "o bairro do cliente", 60, 1),
        complement: cleanText(input.customerComplement, "o complemento do endereço", 156),
    } : null;
    const retention = member(input.retention, ["1", "2"], "a retenção do ISS");
    if (settings.regime === "2" && retention !== "1")
        throw new SefinError("Confira a retenção do ISS para o MEI.");
    return {
        customerName: cleanText(input.customerName, "o nome ou razão social do cliente", 150, 2),
        customerDocument: taxpayer(input.customerDocument, "o CPF ou CNPJ do cliente"),
        customerEmail,
        customerAddress,
        issueDate,
        amountCents: Number(whole) * 100 + Number(fractional.padEnd(2, "0")),
        serviceDescription: cleanText(input.serviceDescription, "a descrição do serviço", 2000, 3),
        notes: cleanText(input.notes, "as informações complementares", 500),
        cityCode: code(input.cityCode || settings.cityCode, 7, "o código IBGE do município do serviço"),
        serviceCode: code(input.serviceCode || settings.serviceCode, 6, "o código nacional do serviço"),
        municipalServiceCode: code(input.municipalServiceCode ?? settings.municipalServiceCode, 3, "a especialização municipal do serviço", false),
        nbs: code(input.nbs ?? settings.nbs, 9, "o código NBS", false),
        retention,
        issRate: settings.regime === "2" ? "" : rate(input.issRate, "a alíquota de ISS", 5, true),
    };
}

function xmlText(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function element(tag, value) {
    return `<${tag}>${xmlText(value)}</${tag}>`;
}

function optional(tag, value) {
    return value ? element(tag, value) : "";
}

function documentTag(doc) {
    return element(doc.length === 14 ? "CNPJ" : "CPF", doc);
}

function nationalAddress(address) {
    return address ? "<end><endNac>" + element("cMun", address.city) + element("CEP", address.zip) + "</endNac>" +
        element("xLgr", address.street) + element("nro", address.number) + optional("xCpl", address.complement) +
        element("xBairro", address.district) + "</end>" : "";
}

export function dpsIdentifier(settings, number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > 999999999999999)
        throw new SefinError("Não foi possível numerar a declaração.", 503);
    return "DPS" + settings.cityCode + "2" + settings.cnpj +
        String(settings.series).padStart(5, "0") + String(number).padStart(15, "0");
}

function documentTime(now) {
    return now.toISOString().slice(0, 19) + "+00:00";
}

export function dpsDocument(settings, draft, number, now = new Date()) {
    const id = dpsIdentifier(settings, number);
    const taxes = "<tribMun>" + element("tribISSQN", "1") + element("tpRetISSQN", draft.retention) +
        optional("pAliq", draft.issRate) + "</tribMun><totTrib>" +
        (settings.regime === "3" ? element("pTotTribSN", settings.totalTaxRate) : element("indTotTrib", "0")) + "</totTrib>";
    const body = element("tpAmb", settings.environment === "production" ? "1" : "2") +
        element("dhEmi", documentTime(now)) + element("verAplic", "WaterSystem") + element("serie", settings.series) +
        element("nDPS", number) + element("dCompet", draft.issueDate) + element("tpEmit", "1") +
        element("cLocEmi", settings.cityCode) + "<prest>" + documentTag(settings.cnpj) + optional("IM", settings.municipalRegistration) +
        "<regTrib>" + element("opSimpNac", settings.regime) + optional("regApTribSN", settings.taxAssessment) +
        element("regEspTrib", settings.specialRegime) + "</regTrib></prest><toma>" + documentTag(draft.customerDocument) +
        element("xNome", draft.customerName) + nationalAddress(draft.customerAddress) + optional("email", draft.customerEmail) +
        "</toma><serv><locPrest>" + element("cLocPrestacao", draft.cityCode) + "</locPrest><cServ>" +
        element("cTribNac", draft.serviceCode) + optional("cTribMun", draft.municipalServiceCode) +
        element("xDescServ", draft.serviceDescription) + optional("cNBS", draft.nbs) + "</cServ>" +
        (draft.notes ? "<infoCompl>" + element("xInfComp", draft.notes) + "</infoCompl>" : "") +
        "</serv><valores><vServPrest>" + element("vServ", (draft.amountCents / 100).toFixed(2)) +
        "</vServPrest><trib>" + taxes + "</trib></valores>";
    return { root: "DPS", tag: "infDPS", id, body };
}

export function cancellationDocument(environment, key, emitterCnpj, input, now = new Date()) {
    if (!/^\d{50}$/.test(key)) throw new SefinError("Nota sem chave nacional válida.", 409);
    const reason = member(input.reason, ["1", "2", "9"], "o motivo do cancelamento");
    const description = cleanText(input.description, "a justificativa do cancelamento", 255, 15);
    const body = element("tpAmb", environment === "production" ? "1" : "2") + element("verAplic", "WaterSystem") +
        element("dhEvento", documentTime(now)) + element("CNPJAutor", emitterCnpj) + element("chNFSe", key) +
        "<e101101>" + element("xDesc", "Cancelamento de NFS-e") + element("cMotivo", reason) +
        element("xMotivo", description) + "</e101101>";
    return { root: "pedRegEvento", tag: "infPedReg", id: "PRE" + key + "101101", body };
}

function base64(bytes) {
    let value = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
        value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(value);
}

function pemBytes(value, label) {
    const text = value.trim().replaceAll("\\n", "\n");
    const body = text.match(new RegExp(`^-----BEGIN ${label}-----\\s+([A-Za-z0-9+/=\\s]+)\\s+-----END ${label}-----$`))?.[1];
    if (!body) throw new Error("Formato PEM inválido.");
    return Uint8Array.from(atob(body.replace(/\s+/g, "")), entry => entry.charCodeAt(0));
}

export async function sefinSigner(env, now = new Date()) {
    if (!env.WATER_SEFIN_TLS?.fetch || !env.WATER_SEFIN_SIGNING_KEY || !env.WATER_SEFIN_CERTIFICATE)
        throw new SefinError("O certificado para emissão pela SEFIN Nacional aguarda instalação no Water System.", 503);
    try {
        const rawCertificate = pemBytes(env.WATER_SEFIN_CERTIFICATE, "CERTIFICATE");
        const certificate = new X509Certificate(rawCertificate);
        if (certificate.ca || now < new Date(certificate.validFrom) || now >= new Date(certificate.validTo))
            throw new Error("Certificado fora da vigência.");
        const privateKey = await crypto.subtle.importKey("pkcs8", pemBytes(env.WATER_SEFIN_SIGNING_KEY, "PRIVATE KEY"), rsa, false, ["sign"]);
        const publicKey = await crypto.subtle.importKey("spki", certificate.publicKey.export({ type: "spki", format: "der" }), rsa, false, ["verify"]);
        const test = encoder.encode("Water System SEFIN");
        const proof = await crypto.subtle.sign(rsa, privateKey, test);
        if (!await crypto.subtle.verify(rsa, publicKey, proof, test)) throw new Error("Chave e certificado diferentes.");
        return { privateKey, certificate: base64(rawCertificate) };
    } catch {
        throw new SefinError("O certificado SEFIN Nacional precisa ser conferido pelo suporte do Water System.", 503);
    }
}

// The XML is generated here with fixed element order and escaped text. The two
// Canonical XML fragments differ from the enclosed fragments only by the inherited namespace.
export async function signFiscalDocument(document, signer) {
    const { root, tag, id, body } = document;
    const open = `<${tag}`;
    const content = ` Id="${id}">${body}</${tag}>`;
    const digest = base64(new Uint8Array(await crypto.subtle.digest("SHA-256",
        encoder.encode(open + ` xmlns="${namespace}"` + content))));
    const signedInfo = `<CanonicalizationMethod Algorithm="${canonicalization}"></CanonicalizationMethod>` +
        `<SignatureMethod Algorithm="${signatureMethod}"></SignatureMethod><Reference URI="#${id}"><Transforms>` +
        `<Transform Algorithm="${signatureNamespace}enveloped-signature"></Transform>` +
        `<Transform Algorithm="${canonicalization}"></Transform></Transforms>` +
        `<DigestMethod Algorithm="${digestMethod}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference>`;
    const value = await crypto.subtle.sign(rsa, signer.privateKey, encoder.encode(
        `<SignedInfo xmlns="${signatureNamespace}">${signedInfo}</SignedInfo>`));
    return `<${root} xmlns="${namespace}" versao="1.01">` + open + content +
        `<Signature xmlns="${signatureNamespace}"><SignedInfo>${signedInfo}</SignedInfo>` +
        `<SignatureValue>${base64(new Uint8Array(value))}</SignatureValue><KeyInfo><X509Data>` +
        `<X509Certificate>${signer.certificate}</X509Certificate></X509Data></KeyInfo></Signature></${root}>`;
}

export async function gzipXml(xml) {
    const compressed = new Blob([xml]).stream().pipeThrough(new CompressionStream("gzip"));
    return base64(new Uint8Array(await new Response(compressed).arrayBuffer()));
}

export async function inflateXml(value) {
    if (typeof value !== "string" || !value || value.length > 400000)
        throw new SefinError("A SEFIN Nacional retornou um XML fora do formato esperado.", 502);
    try {
        const bytes = Uint8Array.from(atob(value), entry => entry.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const reader = stream.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let size = 0;
        let text = "";
        while (true) {
            const { done, value: part } = await reader.read();
            if (done) break;
            size += part.length;
            if (size > 800000) {
                await reader.cancel();
                throw new Error("XML fora do limite.");
            }
            text += decoder.decode(part, { stream: true });
        }
        return text + decoder.decode();
    } catch {
        throw new SefinError("A SEFIN Nacional retornou um XML fora do formato esperado.", 502);
    }
}

export async function authorizedInvoice(payload, submission) {
    const key = String(payload?.chaveAcesso ?? "");
    if (!/^\d{50}$/.test(key) || payload.idDps && payload.idDps !== submission.dps_id)
        throw new SefinError("A SEFIN Nacional não retornou a identificação da nota. Consulte a situação.", 502);
    const xml = await inflateXml(payload.nfseXmlGZipB64);
    const number = /<(?:[\w.-]+:)?nNFSe>([0-9]{1,15})<\/(?:[\w.-]+:)?nNFSe>/.exec(xml)?.[1];
    const id = /<(?:[\w.-]+:)?infNFSe\b[^>]*\bId=["']NFS([0-9]{50})["']/.exec(xml)?.[1];
    const dps = /<(?:[\w.-]+:)?infDPS\b[^>]*\bId=["'](DPS[0-9]{42})["']/.exec(xml)?.[1];
    const environment = /<(?:[\w.-]+:)?tpAmb>([12])<\/(?:[\w.-]+:)?tpAmb>/.exec(xml)?.[1];
    const digestTag = /<(?:[\w.-]+:)?DigestValue>([A-Za-z0-9+/=]+)<\/(?:[\w.-]+:)?DigestValue>/;
    const officialDps = /<(?:[\w.-]+:)?DPS\b[\s\S]*?<\/(?:[\w.-]+:)?DPS\s*>/.exec(xml)?.[0];
    const sentDigest = digestTag.exec(submission.sentXml || "")?.[1];
    if (!number || id !== key || dps !== submission.dps_id || environment !== (submission.environment === "production" ? "1" : "2") ||
        !sentDigest || digestTag.exec(officialDps || "")?.[1] !== sentDigest)
        throw new SefinError("O XML retornado difere da declaração enviada. Consulte a situação.", 502);
    return { key, number, compressedXml: payload.nfseXmlGZipB64 };
}
