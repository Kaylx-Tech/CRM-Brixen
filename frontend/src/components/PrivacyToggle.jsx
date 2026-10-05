import React from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { usePrivacy } from '@/context/PrivacyContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function PrivacyToggle() {
  const { isPrivate, togglePrivacy } = usePrivacy();

  return (
    <Tooltip>
      <TooltipTrigger render={
        <Button
          onClick={togglePrivacy}
          variant="outline"
          size="icon"
          className="relative h-8 w-8 cursor-pointer"
          aria-label={isPrivate ? 'Show payments and amounts' : 'Hide payments and amounts'}
        >
          {isPrivate ? (
            <IconEyeOff className="h-[1.15rem] w-[1.15rem] text-primary transition-transform duration-200" />
          ) : (
            <IconEye className="h-[1.15rem] w-[1.15rem] text-muted-foreground transition-transform duration-200" />
          )}
          <span className="sr-only">Toggle Privacy Mode</span>
        </Button>
      } />
      <TooltipContent side="bottom">
        <p>{isPrivate ? 'Show amounts & payments' : 'Hide amounts & payments'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PrivacyToggle;
