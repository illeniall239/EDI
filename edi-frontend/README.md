# EDI.ai Frontend

This is the Next.js frontend for the EDI.ai data analysis assistant. It provides a modern, responsive interface for interacting with the data analysis backend.

## Features

- File upload for CSV and Excel files
- Real-time data preview
- Interactive chat interface for data analysis queries
- Voice input support
- PDF report generation
- Responsive design for all screen sizes

## Prerequisites

- Node.js 18.x or later
- npm or yarn
- The EDI.ai backend service running on `http://localhost:8000`

## Getting Started

1. Clone the repository and navigate to the frontend directory:
   ```bash
   cd edi-frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env.local` file in the root directory with the following content:
   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

4. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Development

- The project uses TypeScript for type safety
- Tailwind CSS for styling
- ESLint for code linting
- Next.js 14 with App Router

### Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
├── config/          # Configuration files
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

### Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the production application
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
