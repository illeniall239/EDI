"use client";

import { ArrowRight, Bot, Check, ChevronDown, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";

interface AIPromptProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string, mode: string) => void;
    onFileUpload?: () => void;
    disabled?: boolean;
    isProcessing?: boolean;
    placeholder?: string;
    selectedMode?: string;
    onModeChange?: (mode: string) => void;
    // Additional action buttons
    additionalButtons?: React.ReactNode;
    minimal?: boolean;
}

const AI_MODELS = [
    "Simple",
    "Advanced", 
    "Deep Reasoning",
];

const MODEL_ICONS: Record<string, React.ReactNode> = {
    "Simple": <Bot className="w-4 h-4 opacity-75" />,
    "Advanced": <Bot className="w-4 h-4 opacity-75" />,
    "Deep Reasoning": <Bot className="w-4 h-4 opacity-75" />,
};

export default function AIPrompt({
    value,
    onChange,
    onSubmit,
    onFileUpload,
    disabled = false,
    isProcessing = false,
    placeholder = "Ask about your data...",
    selectedMode = "Simple",
    onModeChange,
    additionalButtons,
    minimal = false,
}: AIPromptProps) {
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 72,
        maxHeight: 300,
    });

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !disabled && !isProcessing) {
                onSubmit(value.trim(), selectedMode);
                onChange("");
                adjustHeight(true);
            }
        }
    };

    const handleSubmit = () => {
        if (value.trim() && !disabled && !isProcessing) {
            onSubmit(value.trim(), selectedMode);
            onChange("");
            adjustHeight(true);
        }
    };

    return (
        <div className="w-full">
            <div className="bg-white/5 dark:bg-white/5 rounded-lg p-1.5">
                <div className="relative flex flex-col">
                    <div
                        className="overflow-y-auto"
                        style={{ maxHeight: "400px" }}
                    >
                        <Textarea
                            value={value}
                            placeholder={placeholder}
                            className={cn(
                                "w-full rounded-lg rounded-b-none px-4 py-3 bg-transparent border-none text-white placeholder:text-white/50 resize-none focus-visible:ring-0 focus-visible:ring-offset-0",
                                "min-h-[72px]"
                            )}
                            ref={textareaRef}
                            onKeyDown={handleKeyDown}
                            onChange={(e) => {
                                onChange(e.target.value);
                                adjustHeight();
                            }}
                            disabled={disabled}
                        />
                    </div>

                    <div className="h-14 bg-transparent rounded-b-lg flex items-center">
                        <div className="absolute left-3 right-3 bottom-3 flex items-center justify-between w-[calc(100%-24px)]">
                            <div className="flex items-center gap-2">
                                {!minimal && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            className="flex items-center gap-1 h-8 pl-1 pr-2 text-xs rounded-md text-white hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-white/20"
                                            disabled={disabled}
                                        >
                                            <AnimatePresence mode="wait">
                                                <motion.div
                                                    key={selectedMode}
                                                    initial={{
                                                        opacity: 0,
                                                        y: -5,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    exit={{
                                                        opacity: 0,
                                                        y: 5,
                                                    }}
                                                    transition={{
                                                        duration: 0.15,
                                                    }}
                                                    className="flex items-center gap-1"
                                                >
                                                    {MODEL_ICONS[selectedMode]}
                                                    {selectedMode}
                                                    <ChevronDown className="w-3 h-3 opacity-50" />
                                                </motion.div>
                                            </AnimatePresence>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        className={cn(
                                            "min-w-[10rem]",
                                            "border-white/10 bg-black/90 backdrop-blur-sm"
                                        )}
                                    >
                                        {AI_MODELS.map((model) => (
                                            <DropdownMenuItem
                                                key={model}
                                                onSelect={() => onModeChange?.(model)}
                                                className="flex items-center justify-between gap-2 text-white hover:bg-white/10 focus:bg-white/10"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {MODEL_ICONS[model]}
                                                    <span>{model}</span>
                                                </div>
                                                {selectedMode === model && (
                                                    <Check className="w-4 h-4 text-blue-400" />
                                                )}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                )}
                                {!minimal && <div className="h-4 w-px bg-white/10 mx-0.5" />}
                                {!minimal && onFileUpload && (
                                    <button
                                        onClick={onFileUpload}
                                        className={cn(
                                            "rounded-lg p-2 bg-white/5 cursor-pointer",
                                            "hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-white/20",
                                            "text-white/40 hover:text-white/80 transition-colors"
                                        )}
                                        aria-label="Attach file"
                                        disabled={disabled}
                                    >
                                        <Paperclip className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Additional buttons (voice, reset, etc.) */}
                                {additionalButtons}
                                
                                {/* Send button */}
                                <button
                                    onClick={handleSubmit}
                                    className={cn(
                                        "rounded-lg p-2 bg-white/5",
                                        "hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-white/20",
                                        "transition-colors"
                                    )}
                                    aria-label="Send message"
                                    disabled={disabled || !value.trim() || isProcessing}
                                >
                                    {isProcessing ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white"></div>
                                    ) : (
                                        <ArrowRight
                                            className={cn(
                                                "w-4 h-4 text-white transition-opacity duration-200",
                                                value.trim() && !disabled
                                                    ? "opacity-100"
                                                    : "opacity-30"
                                            )}
                                        />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}