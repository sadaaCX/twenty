import { UndecoratedLink } from '@/ui/navigation/link/components/UndecoratedLink/UndecoratedLink';
import { getWorkspaceAvatarColorSeed } from '@/workspace/utils/getWorkspaceAvatarColorSeed';
import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { AppPath } from 'twenty-shared/types';
import { getImageAbsoluteURI, isDefined } from 'twenty-shared/utils';
import { Avatar } from 'twenty-ui/primitives/data-display';
import { themeCssVariables } from 'twenty-ui/theme';
import { REACT_APP_SERVER_BASE_URL } from '~/config';
import { useRedirectToDefaultDomain } from '~/modules/domain-manager/hooks/useRedirectToDefaultDomain';

type LogoProps = {
  primaryLogo?: string | null;
  secondaryLogo?: string | null;
  placeholder?: string | null;
  onClick?: () => void;
  to?: AppPath;
};

const StyledContainer = styled.div`
  height: ${themeCssVariables.spacing[12]};
  margin-bottom: ${themeCssVariables.spacing[4]};
  margin-top: ${themeCssVariables.spacing[4]};

  position: relative;
  width: ${themeCssVariables.spacing[12]};
`;

const StyledSecondaryLogo = styled.img`
  border-radius: ${themeCssVariables.border.radius.xs};
  height: ${themeCssVariables.spacing[6]};
  width: ${themeCssVariables.spacing[6]};
`;

const StyledSecondaryLogoContainer = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.sm};
  bottom: calc(-1 * ${themeCssVariables.spacing[3]});
  display: flex;
  height: ${themeCssVariables.spacing[7]};
  justify-content: center;

  position: absolute;
  right: calc(-1 * ${themeCssVariables.spacing[3]});
  width: ${themeCssVariables.spacing[7]};
`;

const StyledPrimaryLogo = styled.div`
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  height: 100%;
  width: 100%;
`;

export const Logo = ({
  primaryLogo,
  secondaryLogo,
  placeholder,
  onClick,
  to = AppPath.SignInUp,
}: LogoProps) => {
  const { redirectToDefaultDomain } = useRedirectToDefaultDomain();
  const defaultPrimaryLogoUrl = `${window.location.origin}/branding/sadaa-logo.svg`;

  const primaryLogoUrl = getImageAbsoluteURI({
    imageUrl: primaryLogo ?? defaultPrimaryLogoUrl,
    baseUrl: REACT_APP_SERVER_BASE_URL,
  });

  const secondaryLogoUrl = isNonEmptyString(secondaryLogo)
    ? getImageAbsoluteURI({
        imageUrl: secondaryLogo,
        baseUrl: REACT_APP_SERVER_BASE_URL,
      })
    : null;

  const isUsingDefaultLogo = !isDefined(primaryLogo);

  return (
    <StyledContainer
      onClick={() => onClick?.()}
      style={isUsingDefaultLogo ? { width: 144 } : undefined}
    >
      {isUsingDefaultLogo ? (
        <UndecoratedLink to={to} onClick={() => redirectToDefaultDomain()}>
          <StyledPrimaryLogo
            className="sadaa-wordmark"
            role="img"
            aria-label="Sadaa"
            style={{ backgroundImage: `url(${primaryLogoUrl})` }}
          />
        </UndecoratedLink>
      ) : (
        <StyledPrimaryLogo
          style={{ backgroundImage: `url(${primaryLogoUrl})` }}
        />
      )}
      {!isUsingDefaultLogo && isDefined(secondaryLogoUrl) ? (
        <StyledSecondaryLogoContainer>
          <StyledSecondaryLogo src={secondaryLogoUrl} />
        </StyledSecondaryLogoContainer>
      ) : (
        !isUsingDefaultLogo && isDefined(placeholder) && (
          <StyledSecondaryLogoContainer>
            <Avatar
              size="lg"
              name={placeholder}
              shape="square"
              colorSeed={getWorkspaceAvatarColorSeed(placeholder)}
            />
          </StyledSecondaryLogoContainer>
        )
      )}
    </StyledContainer>
  );
};
