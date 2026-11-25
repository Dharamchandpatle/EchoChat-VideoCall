from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE

OUT = r"C:\Users\dhara\OneDrive\Desktop\Projects\EchoChat\output\EchoChat_Final_Year_Project_Synopsis.docx"

doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.75)
sec.bottom_margin = Inches(0.75)
sec.left_margin = Inches(0.8)
sec.right_margin = Inches(0.8)

styles = doc.styles
styles['Normal'].font.name = 'Times New Roman'
styles['Normal']._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
styles['Normal']._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')
styles['Normal'].font.size = Pt(11)
styles['Normal'].paragraph_format.line_spacing = 1.15
styles['Normal'].paragraph_format.space_after = Pt(6)

for name, size in [('Title', 18), ('Heading 1', 13), ('Heading 2', 11)]:
    style = styles[name]
    style.font.name = 'Times New Roman'
    style._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
    style._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.paragraph_format.space_before = Pt(10 if name != 'Title' else 0)
    style.paragraph_format.space_after = Pt(6)

def set_cell_shading(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    tcPr.append(shd)

def set_cell_border(cell, color='000000', size='6'):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    borders = tcPr.first_child_found_in('w:tcBorders')
    if borders is None:
        borders = OxmlElement('w:tcBorders')
        tcPr.append(borders)
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        tag = 'w:' + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn('w:val'), 'single')
        element.set(qn('w:sz'), size)
        element.set(qn('w:color'), color)

def add_run(p, text, bold=False, italic=False, size=None):
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    r.font.name = 'Times New Roman'
    r._element.rPr.rFonts.set(qn('w:ascii'), 'Times New Roman')
    r._element.rPr.rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    if size:
        r.font.size = Pt(size)
    return r

def para(text='', bold=False, align=None, first_line=False, space_after=None):
    p = doc.add_paragraph()
    if text:
        add_run(p, text, bold=bold)
    if align is not None:
        p.alignment = align
    if first_line:
        p.paragraph_format.first_line_indent = Inches(0.25)
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    return p

def heading(text):
    p = doc.add_paragraph(style='Heading 1')
    p.paragraph_format.keep_with_next = True
    add_run(p, text, bold=True)
    return p

def subheading(text):
    p = doc.add_paragraph(style='Heading 2')
    p.paragraph_format.keep_with_next = True
    add_run(p, text, bold=True)
    return p

def bullets(items):
    for item in items:
        p = doc.add_paragraph(style='Normal')
        p.paragraph_format.left_indent = Inches(0.28)
        p.paragraph_format.first_line_indent = Inches(0)
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(3)
        add_run(p, '- ' + item)

def new_page():
    doc.add_page_break()

# Cover page
for _ in range(4):
    para('')
p = para('ECHOCHAT', align=WD_ALIGN_PARAGRAPH.CENTER)
add_run(p, '', size=20)
for r in p.runs: r.font.size = Pt(20); r.bold = True
p = para('REAL TIME LANGUAGE EXCHANGE AND MESSAGING PLATFORM', align=WD_ALIGN_PARAGRAPH.CENTER)
for r in p.runs: r.font.size = Pt(13); r.bold = True
para('', space_after=12)
p = para('SYNOPSIS', align=WD_ALIGN_PARAGRAPH.CENTER)
for r in p.runs: r.font.size = Pt(16); r.bold = True
para('', space_after=16)

table = doc.add_table(rows=1, cols=2)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
table.autofit = False
table.columns[0].width = Inches(3.3)
table.columns[1].width = Inches(3.3)
left, right = table.rows[0].cells
for c in (left, right):
    c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
    set_cell_border(c)
    c.width = Inches(3.3)

p = left.paragraphs[0]
add_run(p, 'STUDENT DETAILS', bold=True, size=12)
for number, name, mobile in [
    ('1.', 'Dharamchand Patle', '6263827162'),
    ('2.', 'Rishiraj Aatman', '9329497885'),
    ('3.', 'Ujjawal Upadhyay', '7415486866'),
]:
    p = left.add_paragraph()
    add_run(p, f'{number} {name}', bold=True)
    p = left.add_paragraph()
    add_run(p, f'Mobile: {mobile}')

p = right.paragraphs[0]
add_run(p, 'SUPERVISOR DETAILS', bold=True, size=12)
p = right.add_paragraph(); add_run(p, 'Name: Dr. Vrinda Tokekar', bold=True)
p = right.add_paragraph(); add_run(p, 'Email: vtokekar@ietdavv.edu.in')
p = right.add_paragraph(); add_run(p, 'Mobile: 9425317939')
p = right.add_paragraph(); add_run(p, 'Department: Computer Engineering', bold=True)
p = right.add_paragraph(); add_run(p, 'Institute: IET DAVV, Indore', bold=True)

for _ in range(6): para('')
p = para('Submitted in partial fulfillment of the requirements for the degree of', align=WD_ALIGN_PARAGRAPH.CENTER)
p = para('Bachelor of Engineering in Computer Engineering', align=WD_ALIGN_PARAGRAPH.CENTER)
for r in p.runs: r.bold = True
p = para('Institute of Engineering and Technology DAVV Indore', align=WD_ALIGN_PARAGRAPH.CENTER)
for r in p.runs: r.bold = True
p = para('Academic Session 2026', align=WD_ALIGN_PARAGRAPH.CENTER)

new_page()

para('Keywords: Real-Time Messaging, Language Exchange, React, Node.js, Express.js, MongoDB, JWT, Stream Chat, Stream Video, Gemini AI, Zustand, TanStack Query')

heading('1. INTRODUCTION')
para('Language learners often need meaningful interaction with people who speak the language they want to learn. However, existing communication tools usually focus only on messaging, while translation tools are separate and do not help users find suitable language partners. This creates a fragmented experience for learners who need discovery, communication, and language assistance together.', first_line=True)
para('EchoChat is proposed as a web-based real-time language exchange and messaging platform. It allows users to create accounts, complete language-learning profiles, discover other users, send and accept friend requests, exchange messages, and join video calls. A floating assistant powered by Gemini AI supports general questions, language-aware replies, text translation, and language detection.', first_line=True)
para('The project uses a client-server architecture. React provides the user interface, while Node.js and Express.js provide REST APIs. MongoDB stores user and relationship data. Stream Chat and Stream Video provide managed real-time communication capabilities, and JWT stored in HTTP-only cookies protects application sessions. The design keeps application secrets on the server and exposes only user-specific tokens to the client.', first_line=True)

heading('2. LITERATURE SURVEY')
para('Language learning benefits from interaction, feedback, and exposure to real communication. Many social, messaging, and video platforms make it possible to communicate, but they do not always provide language-oriented profiles or built-in assistance. Dedicated translation tools can help with text, but users must move between applications to translate, find partners, and continue a conversation.', first_line=True)
para('Modern web applications commonly use a component-based frontend, REST APIs, document databases, and token-based authentication. React supports reusable interfaces, Express provides routing and middleware, and MongoDB stores JSON-like documents that map naturally to application objects [1]-[3].', first_line=True)
para('Managed communication platforms reduce the effort needed to build scalable real-time chat and video features. Stream provides client SDKs and server-side token support for authenticated messaging and calls [4], [5]. Generative AI APIs, including Gemini, can be integrated through a backend service to provide text-based assistance without exposing provider credentials in the browser [6].', first_line=True)
para('The identified gap is a learning-focused platform that combines profile-based discovery, secure communication, video interaction, and multilingual assistance in a single educational full-stack system. EchoChat addresses this gap through a modular architecture that can be extended with better matching, notifications, safety controls, and persistent AI history.', first_line=True)

new_page()
heading('3. PROBLEM DOMAIN')
para('People who are learning a new language need regular practice with other people, but it can be difficult to find suitable partners and continue communication in a safe, convenient environment. They may need separate tools for profiles, messaging, video calls, and translation. The problem is to create a single responsive web application that supports user discovery, secure friendship connections, real-time communication, and language support.', first_line=True)
subheading('Objectives')
bullets([
    'Develop a responsive web platform for language exchange and communication.',
    'Provide secure signup, login, logout, and protected user actions using JWT authentication.',
    'Allow users to complete profiles with native language, learning language, bio, and location.',
    'Recommend eligible users and support friend-request workflows.',
    'Enable one-to-one real-time messaging and video calls through Stream services.',
    'Integrate Gemini AI for multilingual questions, translation, and language detection.',
    'Provide theme customization and dependable loading states for a smooth user experience.',
    'Maintain a modular frontend-backend architecture suitable for future enhancement.'
])

heading('4. PROPOSED SOLUTION AND METHODOLOGY')
para('EchoChat follows a layered client-server design. The React frontend presents pages for signup, login, onboarding, recommendations, notifications, chat, and calls. It communicates with an Express backend using Axios. TanStack Query manages server data such as the current authenticated user and Stream token, while Zustand manages small global client state such as the selected theme.', first_line=True)
para('The backend validates requests, manages authentication, accesses MongoDB through Mongoose models, and returns REST-style JSON responses. Authentication middleware reads the JWT from the cookie, verifies it, retrieves the user without the password field, and makes that user available to protected controllers. The backend also generates Stream tokens for authenticated users and communicates with Gemini for AI features.', first_line=True)
subheading('Operational Workflow')
bullets([
    'A new user registers with name, email, and password; the password is hashed before storage.',
    'The backend creates a JWT session cookie and the user completes the onboarding profile.',
    'The application recommends other onboarded users who are not already friends.',
    'Users send and accept friend requests; accepted users are added to each other\'s friend lists.',
    'The frontend requests a server-generated Stream token and connects the authenticated user to chat or video services.',
    'The AI assistant sends authenticated requests to the backend, which invokes Gemini and returns the generated result.'
])

heading('5. SYSTEM ARCHITECTURE')
para('The system contains four main layers: the frontend, backend, database, and integrated cloud services. The frontend is responsible for interaction and presentation. The backend is responsible for business logic, authorization, API routing, and secret management. MongoDB stores user and friend-request records. Stream and Gemini are accessed through secure backend-controlled integration points.', first_line=True)
subheading('Major Modules')
bullets([
    'Authentication module: signup, login, logout, JWT cookie creation, and current-user verification.',
    'Profile and onboarding module: user information, language preferences, bio, location, and profile completion.',
    'Social connection module: user recommendations, friend requests, pending requests, and friend lists.',
    'Messaging module: Stream token generation and deterministic one-to-one chat channel creation.',
    'Video call module: call-link sharing and Stream Video client connection.',
    'AI assistance module: chat response, text translation, and language detection.',
    'User experience module: route protection, page loaders, notifications, theme selection, and persistent theme preference.'
])

heading('6. DATA DESIGN')
para('The MongoDB database uses a User collection and a FriendRequest collection. The User document includes full name, email, password hash, bio, profile picture, native language, learning language, location, onboarding status, and friend references. The FriendRequest document records sender, recipient, status, and timestamps. Mongoose schema validation improves consistency, while the email field is unique to prevent duplicate accounts.', first_line=True)
subheading('Key Data Relationships')
bullets([
    'A User can have many friends through an array of User ObjectId references.',
    'A FriendRequest connects one sender User and one recipient User.',
    'A FriendRequest status is either pending or accepted in the current implementation.',
    'Stream maintains the real-time communication identity associated with an EchoChat user ID.'
])

heading('7. API DESIGN')
para('The backend exposes REST-style APIs grouped by authentication, users, chat, and AI features. Protected APIs use authentication middleware before the controller is called. The principal endpoints are listed below.', first_line=True)
bullets([
    'POST /api/auth/signup - creates a new user account.',
    'POST /api/auth/login - verifies credentials and creates the JWT cookie.',
    'POST /api/auth/logout - clears the session cookie.',
    'GET /api/auth/me - returns the authenticated user.',
    'POST /api/auth/onboarding - updates the authenticated user profile.',
    'GET /api/users - returns recommended onboarded users.',
    'GET /api/users/friends - returns the authenticated user\'s populated friend list.',
    'POST /api/users/friend-request/:id - creates a friend request.',
    'PUT /api/users/friend-request/:id/accept - accepts a request and updates both friend lists.',
    'GET /api/users/friend-requests - returns incoming and accepted requests.',
    'GET /api/users/outgoing-friend-requests - returns pending outgoing requests.',
    'GET /api/chat/token - returns a Stream token for the authenticated user.',
    'POST /api/ai/chat - returns a Gemini-assisted response.',
    'POST /api/ai/translate - translates text to the requested language.',
    'POST /api/ai/detect-language - returns a language detection result.'
])

heading('8. SYSTEM DOMAIN AND REQUIREMENTS')
subheading('Software Requirements')
bullets([
    'Operating system: Windows, Linux, or macOS.',
    'Frontend: React, Vite, React Router, Axios, TanStack Query, Zustand, Tailwind CSS, and DaisyUI.',
    'Backend: Node.js, Express.js, Mongoose, bcryptjs, jsonwebtoken, cookie-parser, cors, and dotenv.',
    'Database: MongoDB.',
    'Communication services: Stream Chat and Stream Video.',
    'AI service: Google Gemini API.',
    'Development tools: npm, Visual Studio Code, Git, GitHub, Postman, and a modern browser.'
])
subheading('Hardware and Network Requirements')
bullets([
    'A development computer with at least 4 GB RAM; 8 GB RAM is recommended.',
    'A current web browser such as Chrome, Edge, or Firefox.',
    'A stable internet connection for MongoDB cloud access, Stream services, Gemini requests, and video calls.',
    'A camera and microphone for video calling.'
])

heading('9. APPLICATION DOMAIN')
para('EchoChat can be applied in language-learning communities, colleges, peer-learning groups, and informal cultural-exchange communities. It gives learners a way to create an identity based on language preferences, connect after mutual approval, and practice through text and video communication. The AI assistant can support quick translation and language understanding during use.', first_line=True)
para('The project also serves as an educational example of integrating frontend development, backend APIs, authentication, database design, managed real-time services, and generative AI. The architecture can later be extended with language-based matching scores, group conversation support, content moderation, reporting, blocking, notifications, and persistent conversation history.', first_line=True)

heading('10. EXPECTED OUTCOME')
bullets([
    'A functional responsive web application for language exchange and social communication.',
    'Secure account creation, login sessions, logout, and protected application routes.',
    'User onboarding with native and learning language information.',
    'User recommendations and a complete friend-request acceptance workflow.',
    'Authenticated one-to-one real-time chat and video calling support using Stream.',
    'A Gemini-powered assistant for multilingual help, translation, and language detection.',
    'A maintainable modular architecture with separate frontend, backend, routes, controllers, models, and middleware.',
    'Practical learning in full-stack development, API design, database operations, real-time services, and AI integration.'
])

heading('11. FUTURE SCOPE')
bullets([
    'Improve user matching using language level, interests, location, availability, and learning goals.',
    'Add group chat, community rooms, and scheduled language practice sessions.',
    'Add user blocking, reporting, moderation, and rate limiting for better safety.',
    'Use short-lived renewable Stream tokens and clean up disconnected chat and video clients.',
    'Store AI conversation history and provide structured language-detection output.',
    'Add automated unit, integration, and end-to-end testing.',
    'Add notifications, dashboards, activity history, and deployment monitoring.'
])

heading('REFERENCES')
refs = [
    '[1] React, "React Documentation - Quick Start," Meta Open Source. https://react.dev/learn',
    '[2] Express.js, "Express - Node.js Web Application Framework," Express Documentation. https://expressjs.com/',
    '[3] MongoDB, "MongoDB Documentation," MongoDB. https://www.mongodb.com/docs/',
    '[4] Stream, "React Chat Messaging Documentation," Stream. https://getstream.io/chat/docs/react/',
    '[5] Stream, "React Video and Audio Quickstart," Stream. https://getstream.io/video/docs/react/basics/quickstart/',
    '[6] Google AI for Developers, "Gemini API Documentation," Google. https://ai.google.dev/gemini-api/docs',
    '[7] M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)," RFC 7519, IETF, 2015. https://www.rfc-editor.org/rfc/rfc7519.html',
    '[8] OWASP Foundation, "Authentication Cheat Sheet," OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
    '[9] EchoChat project source code, frontend and backend implementation, accessed September 2026.'
]
for ref in refs:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.18)
    p.paragraph_format.first_line_indent = Inches(-0.18)
    add_run(p, ref)

new_page()
heading('APPENDIX A PROJECT MODULE SUMMARY')
para('Project Title: EchoChat - Real-Time Language Exchange and Messaging Platform')
para('Project Repository: To be added by the project team before final submission.')
subheading('Team Members')
bullets([
    'Dharamchand Patle - Mobile: 6263827162',
    'Rishiraj Aatman - Mobile: 9329497885',
    'Ujjawal Upadhyay - Mobile: 7415486866'
])
subheading('Guide')
bullets([
    'Dr. Vrinda Tokekar',
    'Email: vtokekar@ietdavv.edu.in',
    'Mobile: 9425317939'
])

heading('SIGNATURES')
for text in [
    'Dharamchand Patle\nSignature: ______________________________',
    'Rishiraj Aatman\nSignature: ______________________________',
    'Ujjawal Upadhyay\nSignature: ______________________________',
    'Supervisor: Dr. Vrinda Tokekar\nSignature: ______________________________',
]:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    for idx, line in enumerate(text.split('\n')):
        add_run(p, line, bold=(idx == 0))
        if idx == 0: p.add_run('\n')

# Footer page number field
for section in doc.sections:
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(p, 'Page ')
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), 'PAGE')
    p._p.append(fld)

doc.core_properties.title = 'EchoChat Final Year Project Synopsis'
doc.core_properties.author = 'Dharamchand Patle, Rishiraj Aatman, Ujjawal Upadhyay'
doc.save(OUT)
print(OUT)
