# 📄 Tidy - Your Personal Digital Safe & Mobile Administrative Assistant

**Tidy** aims to reinvent the management of personal documents (administrative, medical, professional, or family) by offering an all-in-one, intuitive, and secure mobile solution.

## 💡 Why this project?
In a world where the volume of information to process keeps growing, document management is becoming a central issue. This transition to a fully digital environment accelerated significantly since January 2026 with the legal obligation in Belgium to produce B2B invoices in digital format via the Peppol network. 

Rather than positioning itself as just another generic cloud storage solution, **Tidy**'s strategy is to become "Your personal administrative assistant in your pocket". The goal is simple: centralize, organize, and protect users' personal documents to reduce cognitive load.

## 🎯 Target Audience
**Tidy** is designed to meet the concrete needs of a diverse range of users:
* **Individuals:** To easily manage and centralize invoices, contracts, identity papers, and medical records.
* **Freelancers and Independent Workers:** To manage a high volume of documents (quotes, invoices, tax declarations) securely on a reliable mobile tool.
* **Small Businesses:** Looking for a lightweight, affordable, and secure alternative to traditional document management solutions.

## ✨ Key Features
**Tidy** offers advanced functionalities:
* **Intelligent Scan & OCR:** Paper document scanning via the camera, with Optical Character Recognition (OCR) to extract text and enable contextual search.
* **Automated Organization:** Hierarchical folders and custom tags, with AI-powered automatic classification and tag suggestions.
* **Offline-first Strategy:** Prevents frustration when there is no network, using local storage and background synchronization once the connection is restored.
* **High-Level Security:** End-to-end encryption, local AES-256 encryption, and strong authentication (biometrics, 2FA).
* **Smart Reminders:** Intelligent notifications for important deadlines like renewals and expiration dates.

## 🛠️ Architecture and Technologies
The development relies on a modern, decoupled back-end / front-end architecture designed to be "Scale Ready":
* **Front-end (Client):** Designed with **Nuxt**, a Vue.js SSR/SPA/PWA framework, ensuring a smooth experience across mobile, tablet, and web.
* **Back-end (Server):** Developed with **Nest**, a comprehensive Node.js framework handling authentication, secure storage, and APIs.
* **Initial Infrastructure (MVP):** Hosted on a VPS with files stored on Amazon S3 Standard, and containerized using Docker.
* **Scalable Infrastructure (Post-launch):** Planned migration to AWS EC2/Lightsail, RDS database, and AWS CloudFront CDN
